// === server.js ===
const express = require('express');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.static(__dirname));

// --- ISBN10 -> ISBN13
function isbn10to13(isbn10) {
  if (isbn10.length !== 10) return null;
  let core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(core[i]) * (i % 2 ? 3 : 1);
  let check = (10 - (sum % 10)) % 10;
  return core + check;
}

// --- SLUG
function slugify(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// --- Vykupujeme-online
async function getBuybackPrice(url) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('p.text-p__detail--price');
    const priceText = await page.$eval('p.text-p__detail--price', el => el.textContent.trim());
    await browser.close();

    const price = parseFloat(priceText.replace('€', '').replace(',', '.').trim());
    return { url, price };
  } catch {
    return { url, price: null };
  }
}

// --- API endpoint
// query: ?title=...&buyPrice=...
app.get('/api/book', async (req, res) => {
  const titleInput = req.query.title;
  const buyPrice = parseFloat(req.query.buyPrice || 0);

  if (!titleInput) return res.json({ error: 'Zadaj názov knihy' });
  if (!buyPrice) return res.json({ error: 'Zadaj cenu, za ktorú kúpiš knihu' });

  // Vyhľadanie knihy cez Google Books podľa názvu
  const gb = await fetch('https://www.googleapis.com/books/v1/volumes?q=intitle:' + encodeURIComponent(titleInput))
    .then(r => r.json());

  if (!gb.items) return res.json({ error: 'Kniha nenájdená', title: titleInput });

  const info = gb.items[0].volumeInfo;
  const title = info.title || 'Unknown';
  const isbn10 = (info.industryIdentifiers || []).find(i => i.type === 'ISBN_10')?.identifier;
  const isbn = isbn10to13(isbn10) || (info.industryIdentifiers || []).find(i => i.type === 'ISBN_13')?.identifier;
  const year = info.publishedDate ? info.publishedDate.slice(0,4) : '0000';

  if (!isbn) return res.json({ error: 'ISBN nenájdené, kniha nie je podporovaná', title });

  const buybackURL = `https://vykupujeme-online.sk/${isbn}-${slugify(title)}-${year}`;
  const buyback = await getBuybackPrice(buybackURL);

  let profit = null;
  if (buyback.price !== null) {
    profit = (buyback.price - buyPrice).toFixed(2) + ' €';
  }

  res.json({
    title,
    isbn,
    isbn13: isbn,
    year,
    buyback,
    buyPrice: buyPrice + ' €',
    profit
  });
});

app.listen(3000, () => console.log('Server beží na http://localhost:3000'));
