// === server.js ===
const express = require('express');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer-core'); // <-- core verzia
const app = express();
app.use(express.static(__dirname));

// --- SLUG
function slugify(text) {
  return text.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- Vykupujeme-online
async function getBuybackPrice(url) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/usr/bin/chromium-browser' // <-- systémový Chromium
    });
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
  const isbn = isbn10 ? '978' + isbn10.slice(0, 9) + (((10 - [...('978'+isbn10.slice(0,9))].reduce((sum, d, i) => sum + parseInt(d)*(i%2?3:1), 0)) % 10)) : null;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));
