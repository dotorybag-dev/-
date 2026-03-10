import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Image as ImageIcon, Palette, Trash2, X, Calendar as CalendarIcon, Monitor, CheckSquare, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { storage, db } from './firebase';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, getDocs, setDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';

type Product = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  imageUrl: string;
  textColor: string;
};

const COLORS = [
  '#111827', // Gray 900
  '#ef4444', // Red 500
  '#f97316', // Orange 500
  '#eab308', // Yellow 500
  '#22c55e', // Green 500
  '#3b82f6', // Blue 500
  '#a855f7', // Purple 500
  '#ec4899', // Pink 500
];

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export default function App() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [products, setProducts] = useState<Product[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'list'>('calendar');

  const [viewImageProduct, setViewImageProduct] = useState<Product | null>(null);

  const handleTabChange = (tab: 'calendar' | 'list') => {
    if (tab === activeTab) return;
    if (tab === 'list') {
      window.history.pushState({ tab: 'list' }, '');
      setActiveTab('list');
    } else {
      setActiveTab('calendar');
    }
  };

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (viewImageProduct) {
        setViewImageProduct(null);
        return;
      }
      
      if (e.state?.tab === 'list') {
        setActiveTab('list');
      } else {
        setActiveTab('calendar');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [viewImageProduct]);

  useEffect(() => {
    const fetchData = async () => {
      if (!db) {
        setIsLoading(false);
        setFirebaseError('Firebase 환경변수가 설정되지 않았습니다.');
        return;
      }
      try {
        const productsSnapshot = await getDocs(collection(db, 'products'));
        const productsData = productsSnapshot.docs.map(d => d.data() as Product);
        setProducts(productsData);

        const holidaysDoc = await getDoc(doc(db, 'settings', 'holidays'));
        if (holidaysDoc.exists()) {
          setHolidays(holidaysDoc.data().dates || []);
        }
      } catch (error: any) {
        console.error('Failed to fetch data:', error);
        if (error.code === 'unavailable') {
          setFirebaseError('Firestore 데이터베이스에 연결할 수 없습니다. Firebase 콘솔에서 Firestore Database를 생성했는지 확인해주세요.');
        } else {
          setFirebaseError(`데이터를 불러오는 중 오류가 발생했습니다: ${error.message}`);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const [colorPickerProduct, setColorPickerProduct] = useState<Product | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Add Product Form State
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newImage, setNewImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Swipe State
  const [swipeStart, setSwipeStart] = useState<{x: number, y: number} | null>(null);

  const handleSwipeStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) {
      setSwipeStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else {
      setSwipeStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleSwipeEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (!swipeStart) return;

    let endX, endY;
    if ('changedTouches' in e) {
      endX = e.changedTouches[0].clientX;
      endY = e.changedTouches[0].clientY;
    } else {
      endX = (e as React.MouseEvent).clientX;
      endY = (e as React.MouseEvent).clientY;
    }

    const distanceX = swipeStart.x - endX;
    const distanceY = swipeStart.y - endY;
    const minSwipeDistance = 50;
    
    // Only trigger swipe if horizontal distance is greater than vertical distance
    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > minSwipeDistance) {
      const isLeftSwipe = distanceX > 0;
      
      const newDate = new Date(selectedDate);
      if (isLeftSwipe) {
        newDate.setDate(selectedDate.getDate() + 1);
      } else {
        newDate.setDate(selectedDate.getDate() - 1);
      }
      
      setSelectedDate(newDate);
      if (newDate.getMonth() !== currentMonth.getMonth()) {
        setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
      }
    }
    setSwipeStart(null);
  };

  // Snip State
  const [snipState, setSnipState] = useState({
    image: null as string | null,
    isDragging: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    naturalWidth: 0,
    naturalHeight: 0,
    containerW: 0,
    containerH: 0,
  });

  const handleScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      
      video.onloadedmetadata = () => {
        video.play();
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg');
            setSnipState({
              image: dataUrl,
              isDragging: false,
              startX: 0, startY: 0, currentX: 0, currentY: 0,
              naturalWidth: video.videoWidth,
              naturalHeight: video.videoHeight,
              containerW: window.innerWidth,
              containerH: window.innerHeight,
            });
          }
          stream.getTracks().forEach(track => track.stop());
        }, 500);
      };
    } catch (err) {
      console.error("Error capturing screen:", err);
      alert("화면 캡쳐를 취소했거나 지원하지 않는 브라우저/기기입니다.");
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setSnipState(s => ({
      ...s,
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      containerW: window.innerWidth,
      containerH: window.innerHeight,
    }));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!snipState.isDragging) return;
    setSnipState(s => ({
      ...s,
      currentX: e.clientX,
      currentY: e.clientY
    }));
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!snipState.isDragging) return;
    
    const { startX, startY, currentX, currentY, naturalWidth, naturalHeight, image, containerW, containerH } = snipState;
    setSnipState(s => ({ ...s, isDragging: false }));

    const dragX = Math.min(startX, currentX);
    const dragY = Math.min(startY, currentY);
    const dragW = Math.abs(currentX - startX);
    const dragH = Math.abs(currentY - startY);

    if (dragW < 10 || dragH < 10) return;
    if (!image) return;

    const imgRatio = naturalWidth / naturalHeight;
    const containerRatio = containerW / containerH;

    let renderWidth, renderHeight, offsetX, offsetY;
    if (imgRatio > containerRatio) {
       renderWidth = containerW;
       renderHeight = containerW / imgRatio;
       offsetX = 0;
       offsetY = (containerH - renderHeight) / 2;
    } else {
       renderHeight = containerH;
       renderWidth = containerH * imgRatio;
       offsetX = (containerW - renderWidth) / 2;
       offsetY = 0;
    }

    const scale = naturalWidth / renderWidth;
    
    const clampedDragX = Math.max(offsetX, Math.min(dragX, offsetX + renderWidth));
    const clampedDragY = Math.max(offsetY, Math.min(dragY, offsetY + renderHeight));
    const clampedDragMaxX = Math.max(offsetX, Math.min(dragX + dragW, offsetX + renderWidth));
    const clampedDragMaxY = Math.max(offsetY, Math.min(dragY + dragH, offsetY + renderHeight));

    const finalDragW = clampedDragMaxX - clampedDragX;
    const finalDragH = clampedDragMaxY - clampedDragY;

    if (finalDragW < 10 || finalDragH < 10) return;

    const cropX = (clampedDragX - offsetX) * scale;
    const cropY = (clampedDragY - offsetY) * scale;
    const cropW = finalDragW * scale;
    const cropH = finalDragH * scale;

    const imgElement = await createImage(image);
    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const croppedDataUrl = canvas.toDataURL('image/jpeg');
      setNewImage(croppedDataUrl);
      setSnipState(s => ({ ...s, image: null }));
    }
  };

  const days = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const daysArray: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      daysArray.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      daysArray.push(new Date(year, month, i));
    }
    return daysArray;
  }, [currentMonth]);

  const selectedDateString = formatDate(selectedDate);
  const selectedProducts = products.filter(p => p.date === selectedDateString);

  // Reset selection mode when date changes
  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedProductIds([]);
  }, [selectedDateString]);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const toggleHoliday = async () => {
    let newHolidays;
    if (holidays.includes(selectedDateString)) {
      newHolidays = holidays.filter(d => d !== selectedDateString);
    } else {
      newHolidays = [...holidays, selectedDateString];
    }
    setHolidays(newHolidays);
    
    if (db) {
      try {
        await setDoc(doc(db, 'settings', 'holidays'), { dates: newHolidays });
      } catch (error) {
        console.error('Failed to update holidays:', error);
      }
    }
  };

  const handleSaveProduct = async () => {
    if (!newName.trim()) return;
    
    setIsUploading(true);
    let finalImageUrl = newImage || `https://picsum.photos/seed/${Date.now()}/400/400`;

    if (newImage && newImage.startsWith('data:image')) {
      if (storage) {
        try {
          const imageRef = ref(storage, `products/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
          await uploadString(imageRef, newImage, 'data_url');
          finalImageUrl = await getDownloadURL(imageRef);
        } catch (error: any) {
          console.error("Firebase upload failed:", error);
          alert(`이미지 업로드에 실패했습니다.\n사유: ${error.message || error}\nFirebase 설정이나 보안 규칙을 다시 확인해주세요.`);
          setIsUploading(false);
          return;
        }
      } else {
        alert("Firebase가 설정되지 않아 이미지를 저장할 수 없습니다. 환경변수를 설정해주세요.");
        setIsUploading(false);
        return;
      }
    }

    if (editingProduct) {
      const updatedProduct = {
        ...editingProduct,
        name: newName,
        imageUrl: finalImageUrl,
        textColor: newColor,
        date: selectedDateString,
      };
      
      setProducts(products.map(p => p.id === editingProduct.id ? updatedProduct : p));
      
      try {
        if (db) {
          await setDoc(doc(db, 'products', editingProduct.id), updatedProduct);
        }
      } catch (error) {
        console.error('Failed to update product:', error);
      }
    } else {
      const newProduct: Product = {
        id: generateId(),
        date: selectedDateString,
        name: newName,
        imageUrl: finalImageUrl,
        textColor: newColor,
      };
      
      // Optimistic update
      setProducts([...products, newProduct]);
      
      try {
        if (db) {
          await setDoc(doc(db, 'products', newProduct.id), newProduct);
        }
      } catch (error) {
        console.error('Failed to save product:', error);
      }
    }

    setNewName('');
    setNewColor(COLORS[0]);
    setNewImage(null);
    setEditingProduct(null);
    setIsAddModalOpen(false);
    setIsUploading(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    setProductToDelete(id);
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const id = productToDelete;
    const product = products.find(p => p.id === id);
    
    setProducts(products.filter(p => p.id !== id));
    setSelectedProductIds(prev => prev.filter(selectedId => selectedId !== id));
    setProductToDelete(null);
    
    try {
      if (db) {
        await deleteDoc(doc(db, 'products', id));
      }
      
      if (product?.imageUrl.includes('firebasestorage.googleapis.com') && storage) {
        const imageRef = ref(storage, product.imageUrl);
        await deleteObject(imageRef).catch(e => console.error("Failed to delete from Firebase:", e));
      }
    } catch (error) {
      console.error('Failed to delete product:', error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    setBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    const productsToDelete = products.filter(p => selectedProductIds.includes(p.id));
    setProducts(products.filter(p => !selectedProductIds.includes(p.id)));
    setSelectedProductIds([]);
    setIsSelectionMode(false);
    setBulkDeleteConfirm(false);

    for (const product of productsToDelete) {
      try {
        if (db) {
          await deleteDoc(doc(db, 'products', product.id));
        }
        
        if (product.imageUrl.includes('firebasestorage.googleapis.com') && storage) {
          const imageRef = ref(storage, product.imageUrl);
          await deleteObject(imageRef).catch(e => console.error("Failed to delete from Firebase:", e));
        }
      } catch (error) {
        console.error('Failed to delete product:', error);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, productId: string) => {
    e.dataTransfer.setData('productId', productId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const productId = e.dataTransfer.getData('productId');
    if (!productId) return;

    const targetDateString = formatDate(targetDate);
    
    // Optimistic update
    setProducts(products.map(p => 
      p.id === productId ? { ...p, date: targetDateString } : p
    ));

    try {
      if (db) {
        await setDoc(doc(db, 'products', productId), { date: targetDateString }, { merge: true });
      }
    } catch (error) {
      console.error('Failed to update product date:', error);
    }
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.length === selectedProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(selectedProducts.map(p => p.id));
    }
  };

  const handleChangeColor = async (color: string) => {
    if (!colorPickerProduct) return;
    const id = colorPickerProduct.id;
    setProducts(products.map(p => p.id === id ? { ...p, textColor: color } : p));
    setColorPickerProduct(null);
    
    try {
      if (db) {
        await setDoc(doc(db, 'products', id), { textColor: color }, { merge: true });
      }
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  };

  const getProductsForDate = (date: Date) => {
    const dateString = formatDate(date);
    return products.filter(p => p.date === dateString);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center font-sans text-gray-900">
      <div className="w-full md:max-w-[1400px] bg-white h-[100dvh] flex flex-col relative shadow-2xl overflow-hidden">
        
        {/* Firebase Error Banner */}
        {firebaseError && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4 rounded-md shadow-sm z-50 absolute top-0 left-0 right-0">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700 font-medium">
                  {firebaseError}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <CalendarIcon className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-gray-900">도토리 출고 일정</h1>
          </div>
          <button 
            onClick={() => {
              setEditingProduct(null);
              setNewName('');
              setNewColor(COLORS[0]);
              setNewImage(null);
              setIsAddModalOpen(true);
            }}
            className="w-8 h-8 bg-gray-50 hover:bg-gray-100 rounded-full flex items-center justify-center transition-colors"
          >
            <Plus className="w-4 h-4 text-gray-600" />
          </button>
        </header>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {/* Calendar Section */}
          <div className={`flex-1 flex-col bg-slate-50 overflow-hidden pb-[60px] md:pb-0 md:border-r md:border-gray-200 ${activeTab === 'calendar' ? 'flex' : 'hidden md:flex'}`}>
            <div className="px-4 pt-3 pb-2 z-10 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">
                    {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                  </h2>
                  <button
                    onClick={() => {
                      const now = new Date();
                      setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                      setSelectedDate(now);
                      handleTabChange('list');
                    }}
                    className="text-[10px] px-2 py-1 rounded border transition-colors bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                  >
                    오늘
                  </button>
                </div>
                <div className="flex gap-1">
                  <button onClick={handlePrevMonth} className="p-1.5 hover:bg-gray-200 rounded-full transition-colors">
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={handleNextMonth} className="p-1.5 hover:bg-gray-200 rounded-full transition-colors">
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                {/* Days Header */}
                {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                  <div key={day} className={`text-center text-[10px] md:text-sm font-medium py-1.5 md:py-2.5 bg-slate-50 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                    {day}
                  </div>
                ))}
                
                {/* Calendar Grid */}
                {days.map((date, i) => {
                  if (!date) return <div key={`empty-${i}`} className="bg-white min-h-[80px] md:min-h-[120px]" />;
                  
                  const isToday = formatDate(date) === formatDate(today);
                  const dateProducts = getProductsForDate(date);
                  const displayProducts = dateProducts.slice(0, 6);
                  const moreCount = dateProducts.length - 6;
                  const isSunday = date.getDay() === 0;
                  const isSaturday = date.getDay() === 6;
                  const isHoliday = holidays.includes(formatDate(date));

                  return (
                    <div
                      key={`date-${i}`}
                      onClick={() => {
                        setSelectedDate(date);
                        handleTabChange('list');
                      }}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, date)}
                      className={`
                        bg-white p-1 md:p-1.5 min-h-[80px] md:min-h-[100px] cursor-pointer hover:bg-gray-50 flex flex-col gap-1 transition-colors
                        ${isToday ? 'bg-blue-50/30' : ''}
                      `}
                    >
                      <div className={`
                        text-[10px] md:text-xs font-medium w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-blue-600 text-white' : ''}
                        ${!isToday && (isSunday || isHoliday) ? 'text-red-500' : ''}
                        ${!isToday && !isSunday && !isHoliday && isSaturday ? 'text-blue-500' : ''}
                        ${!isToday && !isSunday && !isHoliday && !isSaturday ? 'text-gray-700' : ''}
                      `}>
                        {date.getDate()}
                      </div>
                      <div className="flex flex-col gap-[2px] overflow-hidden">
                        {displayProducts.map(p => (
                          <div 
                            key={p.id} 
                            className="text-[8px] md:text-[10px] truncate px-1 md:px-1.5 py-[1px] md:py-0.5 rounded-[2px] md:rounded cursor-grab active:cursor-grabbing" 
                            style={{ backgroundColor: p.textColor, color: 'white' }}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleDragStart(e, p.id);
                            }}
                          >
                            {p.name}
                          </div>
                        ))}
                        {moreCount > 0 && (
                          <div className="text-[8px] md:text-[10px] text-gray-500 font-medium px-1 md:px-1.5 mt-0.5 md:mt-1">
                            {moreCount}개 더보기
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Product List Section */}
          <div 
            className={`flex-1 md:w-96 md:flex-none bg-gray-50 overflow-y-auto px-4 py-4 pb-[80px] md:pb-4 flex-col ${activeTab === 'list' ? 'flex' : 'hidden md:flex'}`}
            onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
          onMouseDown={handleSwipeStart}
          onMouseUp={handleSwipeEnd}
          onMouseLeave={() => setSwipeStart(null)}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">
                {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 출고 목록
              </h3>
              <button
                onClick={toggleHoliday}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${holidays.includes(selectedDateString) ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              >
                {holidays.includes(selectedDateString) ? '휴일 해제' : '휴일 지정'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {selectedProducts.length > 0 && (
                <button
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    if (isSelectionMode) setSelectedProductIds([]);
                  }}
                  className={`text-xs font-medium px-2 py-1 rounded transition-colors ${isSelectionMode ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                >
                  {isSelectionMode ? '선택 취소' : '선택'}
                </button>
              )}
              <span className="text-xs font-medium bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                {selectedProducts.length}건
              </span>
            </div>
          </div>

          {isSelectionMode && selectedProducts.length > 0 && (
            <div className="flex items-center justify-between mb-3 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
              <button 
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                {selectedProductIds.length === selectedProducts.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                전체 선택
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedProductIds.length === 0}
                className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600 disabled:opacity-50 disabled:hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
                선택 삭제 ({selectedProductIds.length})
              </button>
            </div>
          )}

          {selectedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <CalendarIcon className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm">{isLoading ? '불러오는 중...' : '예정된 출고가 없습니다.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {selectedProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between group"
                  >
                    <button 
                      className="flex-1 flex items-center gap-2 text-left"
                      onClick={() => {
                        setViewImageProduct(product);
                        window.history.pushState({ modal: 'image' }, '');
                      }}
                    >
                      <span className="font-medium text-sm truncate" style={{ color: product.textColor }}>
                        {product.name}
                      </span>
                    </button>
                    
                    <div className="flex items-center ml-2 gap-2">
                      {isSelectionMode ? (
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleProductSelection(product.id); }}
                          className="p-1.5 text-gray-400 hover:text-blue-500 rounded-full transition-colors"
                        >
                          {selectedProductIds.includes(product.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-500" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setColorPickerProduct(product); }}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-full transition-colors"
                          >
                            <Palette className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.id); }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
        </div>

        {/* Bottom Navigation */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex items-center justify-around py-2 px-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
          <button
            onClick={() => handleTabChange('calendar')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'calendar' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <CalendarIcon className="w-5 h-5" />
            <span className="text-[10px] font-medium">캘린더</span>
          </button>
          <button
            onClick={() => handleTabChange('list')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'list' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="text-[10px] font-medium">출고목록</span>
          </button>
        </div>

        {/* Modals */}
        <AnimatePresence>
          {/* Delete Confirmation Modal */}
          {productToDelete && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
              onClick={() => setProductToDelete(null)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 mb-4 text-red-600">
                  <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">출고 삭제</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  선택하신 출고 일정을 정말 삭제하시겠습니까?<br/>
                  이 작업은 되돌릴 수 없습니다.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setProductToDelete(null)}
                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    onClick={confirmDeleteProduct}
                    className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
                  >
                    삭제하기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Bulk Delete Confirmation Modal */}
          {bulkDeleteConfirm && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
              onClick={() => setBulkDeleteConfirm(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 mb-4 text-red-600">
                  <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">선택 삭제</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  선택하신 {selectedProductIds.length}개의 출고 일정을 모두 삭제하시겠습니까?<br/>
                  이 작업은 되돌릴 수 없습니다.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setBulkDeleteConfirm(false)}
                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    onClick={confirmBulkDelete}
                    className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
                  >
                    삭제하기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Snip Modal */}
          {snipState.image && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black select-none touch-none cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <img 
                src={snipState.image} 
                className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-40" 
                draggable={false}
              />
              {snipState.isDragging && (
                <div 
                  className="absolute border-2 border-blue-500 bg-transparent overflow-hidden"
                  style={{
                    left: Math.min(snipState.startX, snipState.currentX),
                    top: Math.min(snipState.startY, snipState.currentY),
                    width: Math.abs(snipState.currentX - snipState.startX),
                    height: Math.abs(snipState.currentY - snipState.startY),
                  }}
                >
                  <img 
                    src={snipState.image} 
                    className="absolute max-w-none pointer-events-none"
                    style={{
                      width: snipState.containerW,
                      height: snipState.containerH,
                      objectFit: 'contain',
                      left: -Math.min(snipState.startX, snipState.currentX),
                      top: -Math.min(snipState.startY, snipState.currentY),
                    }}
                    draggable={false}
                  />
                </div>
              )}
              <div className="absolute top-8 left-0 right-0 text-center pointer-events-none">
                <p className="bg-black/70 text-white inline-block px-4 py-2 rounded-full text-sm font-medium">
                  캡쳐할 영역을 드래그하세요
                </p>
              </div>
              <button 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSnipState(s => ({...s, image: null}))}
                className="absolute top-6 right-6 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white z-10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* Image Modal */}
          {viewImageProduct && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
              onClick={() => {
                setViewImageProduct(null);
                if (window.history.state?.modal === 'image') {
                  window.history.back();
                }
              }}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="relative aspect-square w-full bg-gray-100">
                  <img 
                    src={viewImageProduct.imageUrl} 
                    alt={viewImageProduct.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button 
                    onClick={() => {
                      setViewImageProduct(null);
                      if (window.history.state?.modal === 'image') {
                        window.history.back();
                      }
                    }}
                    className="absolute top-4 right-4 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-lg" style={{ color: viewImageProduct.textColor }}>
                      {viewImageProduct.name}
                    </h3>
                    <button 
                      onClick={() => {
                        setEditingProduct(viewImageProduct);
                        setNewName(viewImageProduct.name);
                        setNewColor(viewImageProduct.textColor);
                        setNewImage(viewImageProduct.imageUrl);
                        setSelectedDate(new Date(viewImageProduct.date));
                        setViewImageProduct(null);
                        setIsAddModalOpen(true);
                      }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-full transition-colors"
                    >
                      수정
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">
                    출고일: {viewImageProduct.date}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Color Picker Modal */}
          {colorPickerProduct && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
              onClick={() => setColorPickerProduct(null)}
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white w-full rounded-t-3xl p-6 shadow-2xl pb-10"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg">색상 변경</h3>
                  <button onClick={() => setColorPickerProduct(null)} className="p-2 bg-gray-100 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => handleChangeColor(color)}
                      className="aspect-square rounded-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                      style={{ backgroundColor: color }}
                    >
                      {colorPickerProduct.textColor === color && (
                        <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Add Product Modal */}
          {isAddModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
              onClick={() => setIsAddModalOpen(false)}
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white w-full rounded-t-3xl p-6 shadow-2xl pb-10"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg">{editingProduct ? '출고 수정' : '새 출고 등록'}</h3>
                  <button onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingProduct(null);
                  }} className="p-2 bg-gray-100 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">출고일</label>
                    <div className="w-full bg-gray-50 border border-gray-200 px-2 py-1.5 rounded-xl flex items-center justify-between">
                      <button 
                        onClick={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setDate(newDate.getDate() - 1);
                          setSelectedDate(newDate);
                          if (newDate.getMonth() !== currentMonth.getMonth() || newDate.getFullYear() !== currentMonth.getFullYear()) {
                            setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
                          }
                        }}
                        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                      </button>
                      <div className="relative flex-1 flex items-center justify-center">
                        <span className="font-medium text-gray-700">
                          {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일
                        </span>
                        <input 
                          type="date"
                          value={formatDate(selectedDate)}
                          onChange={(e) => {
                            if (e.target.value) {
                              const newDate = new Date(e.target.value);
                              setSelectedDate(newDate);
                              if (newDate.getMonth() !== currentMonth.getMonth() || newDate.getFullYear() !== currentMonth.getFullYear()) {
                                setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
                              }
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setDate(newDate.getDate() + 1);
                          setSelectedDate(newDate);
                          if (newDate.getMonth() !== currentMonth.getMonth() || newDate.getFullYear() !== currentMonth.getFullYear()) {
                            setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
                          }
                        }}
                        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제품명</label>
                    <input 
                      type="text" 
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="제품명을 입력하세요"
                      className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제품 사진</label>
                    <div className="flex items-center gap-3">
                      {newImage ? (
                        <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200">
                          <img src={newImage} alt="Preview" className="w-full h-full object-cover" />
                          <button
                            onClick={() => setNewImage(null)}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <label className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 cursor-pointer transition-colors bg-gray-50">
                            <ImageIcon className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-medium">사진 등록</span>
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleImageUpload} 
                              className="hidden" 
                            />
                          </label>
                          <button
                            onClick={handleScreenCapture}
                            className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 cursor-pointer transition-colors bg-gray-50"
                          >
                            <Monitor className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-medium">화면 캡쳐</span>
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 flex-1">
                        {newImage ? '사진이 등록되었습니다.' : '제품 사진을 선택해주세요. (선택사항)'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">표시 색상</label>
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
                      {COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setNewColor(color)}
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all snap-center ${newColor === color ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''}`}
                          style={{ backgroundColor: color }}
                        >
                          {newColor === color && (
                            <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveProduct}
                    disabled={!newName.trim() || isUploading}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl mt-4 disabled:opacity-50 disabled:bg-gray-300 transition-colors flex items-center justify-center"
                  >
                    {isUploading ? '사진 업로드 중...' : (editingProduct ? '수정하기' : '등록하기')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
