import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite Database
const db = new Database('app.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    date TEXT,
    name TEXT,
    imageUrl TEXT,
    textColor TEXT
  )
`);

// Cleanup any invalid products that might have been created due to crypto.randomUUID() failing
try {
  db.exec(`DELETE FROM products WHERE id IS NULL OR id = 'undefined' OR id = 'null'`);
} catch (e) {
  console.error('Failed to cleanup invalid products:', e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for Base64 images
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get('/api/products', (req, res) => {
    try {
      const products = db.prepare('SELECT * FROM products').all();
      res.json(products);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.post('/api/products', (req, res) => {
    const { id, date, name, imageUrl, textColor } = req.body;
    try {
      const stmt = db.prepare('INSERT INTO products (id, date, name, imageUrl, textColor) VALUES (?, ?, ?, ?, ?)');
      stmt.run(id, date, name, imageUrl, textColor);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to save product:', error);
      res.status(500).json({ error: 'Failed to save product' });
    }
  });

  app.delete('/api/products/:id', (req, res) => {
    try {
      const stmt = db.prepare('DELETE FROM products WHERE id = ?');
      stmt.run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  app.put('/api/products/:id', (req, res) => {
    const { name, imageUrl, textColor } = req.body;
    try {
      const stmt = db.prepare('UPDATE products SET name = ?, imageUrl = ?, textColor = ? WHERE id = ?');
      stmt.run(name, imageUrl, textColor, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to update product:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.put('/api/products/:id/color', (req, res) => {
    const { textColor } = req.body;
    try {
      const stmt = db.prepare('UPDATE products SET textColor = ? WHERE id = ?');
      stmt.run(textColor, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to update product color:', error);
      res.status(500).json({ error: 'Failed to update product color' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
