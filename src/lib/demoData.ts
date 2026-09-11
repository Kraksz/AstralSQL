import type { Database } from "sql.js";

export function seedDemoDatabase(db: Database): void {
  db.run(`
    PRAGMA foreign_keys = ON;
    BEGIN;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      country TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'Free',
      created_at TEXT NOT NULL
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      total REAL NOT NULL CHECK (total >= 0),
      created_at TEXT NOT NULL
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL
    );
    CREATE INDEX idx_orders_user ON orders(user_id);
    CREATE INDEX idx_order_items_order ON order_items(order_id);
  `);

  const firstNames = [
    "Olivia",
    "Liam",
    "Emma",
    "Noah",
    "Amelia",
    "Elijah",
    "Sophia",
    "James",
    "Charlotte",
    "Oliver",
    "Isabella",
    "Lucas",
    "Mia",
    "Ethan",
    "Harper",
    "Aiden",
    "Evelyn",
    "Henry",
    "Sofia",
    "Leo",
  ];
  const lastNames = [
    "Bennett",
    "Chen",
    "Mitchell",
    "Williams",
    "Anderson",
    "Park",
    "Carter",
    "Wilson",
    "Morgan",
    "Taylor",
    "Reed",
    "Kim",
    "Clarke",
    "Harris",
    "Brooks",
    "Singh",
    "Hayes",
    "Rivera",
    "Petrov",
    "Martin",
  ];
  const countries = [
    "United States",
    "United Kingdom",
    "Canada",
    "Germany",
    "Australia",
    "Netherlands",
    "France",
    "Japan",
  ];
  const plans = ["Pro", "Free", "Team", "Pro", "Free"];
  const insertUser = db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)");
  for (let index = 0; index < 100; index++) {
    const first = firstNames[index % firstNames.length];
    const last =
      lastNames[(index + Math.floor(index / 20) * 3) % lastNames.length];
    insertUser.run([
      index + 1,
      `${first} ${last}`,
      `${first.toLowerCase()}.${last.toLowerCase()}${index >= 20 ? index + 1 : ""}@example.com`,
      countries[index % countries.length],
      plans[index % plans.length],
      `2026-08-${String(28 - (index % 27)).padStart(2, "0")} ${String(9 + (index % 12)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}:00`,
    ]);
  }
  insertUser.free();
  const productData: [string, string, number, number][] = [
    ["Orbit keyboard", "Accessories", 129, 48],
    ["Lunar desk mat", "Accessories", 39, 112],
    ["Stellar monitor", "Displays", 499, 21],
    ["Nebula headphones", "Audio", 179, 64],
    ["Comet mouse", "Accessories", 69, 88],
    ["Atlas USB hub", "Accessories", 49, 135],
    ["Solstice speakers", "Audio", 149, 37],
    ["Horizon light bar", "Lighting", 89, 56],
    ["Voyager backpack", "Travel", 119, 73],
    ["Eclipse webcam", "Video", 99, 92],
    ["Nova laptop stand", "Accessories", 59, 106],
    ["Celestial lamp", "Lighting", 79, 41],
  ];
  const insertProduct = db.prepare(
    "INSERT INTO products VALUES (?, ?, ?, ?, ?)",
  );
  productData.forEach((product, index) =>
    insertProduct.run([index + 1, ...product]),
  );
  insertProduct.free();
  const insertOrder = db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?)");
  const insertItem = db.prepare(
    "INSERT INTO order_items VALUES (?, ?, ?, ?, ?)",
  );
  for (let index = 0; index < 100; index++) {
    const productIndex = index % productData.length;
    const quantity = (index % 3) + 1;
    const price = productData[productIndex][2];
    insertOrder.run([
      index + 1,
      ((index * 7) % 100) + 1,
      ["completed", "completed", "processing", "shipped"][index % 4],
      price * quantity,
      `2026-09-${String((index % 5) + 1).padStart(2, "0")} 12:00:00`,
    ]);
    insertItem.run([index + 1, index + 1, productIndex + 1, quantity, price]);
  }
  insertOrder.free();
  insertItem.free();
  db.run("COMMIT");
}
