# Coco Germany

A simple static website for a small German educational publishing brand.

The project is intentionally beginner-friendly:

- No TypeScript
- No React
- No build step
- No backend server
- Firebase Authentication for email/password and Google login
- Firebase Firestore for products and orders
- GitHub raw/CDN links for product images

## Files

- `index.html` - page shell, desktop navigation, mobile bottom navigation
- `styles.css` - all styling
- `app.js` - page content, simple hash navigation, auth, checkout, Firestore, CDN image galleries, admin panel
- `firebase-config.example.js` - example Firebase values
- `public/images/` - local website images
- `netlify.toml` - Netlify static hosting config

## Pages

The site uses simple hash URLs:

- `#/`
- `#/resources`
- `#/resources/a1-foundations`
- `#/resources/b1-exam-companion`
- `#/videos`
- `#/about`
- `#/contact`
- `#/purchase`
- `#/checkout/a1-foundations`
- `#/login`
- `#/register`
- `#/forgot-password`
- `#/account`
- `#/admin`
- `#/admin/orders`
- `#/admin/products`
- `#/admin/analytics`
- `#/admin/customers`
- `#/admin/videos`
- `#/admin/settings`
- `#/success`

## Firebase Setup

1. Create a Firestore database.
2. Enable Firebase Authentication with email/password.
3. Use the `firebaseConfig` object at the top of `app.js`.
4. Create Firestore collections named `orders`, `products`, `videos`, and `userProfiles`.

Orders are stored in `orders` with `Pending` status for paid products.
Products are stored in `products` and now support `productType` (`free` or `paid`), `downloadUrl` for free products, `archived`, and a `prices` JSON object such as `{ "USD": 19, "EUR": 18, "INR": 1599, "GBP": 15, "CAD": 25, "AUD": 29 }`.
Videos are stored in `videos` with `title`, `category`, `embedUrl`, `description`, `imageLinks`, and `publishedDate`.

Product images are stored as URL fields, not uploaded through the website. In the admin panel, paste one GitHub raw/CDN image URL per line. Normal GitHub `blob` links are converted to `raw.githubusercontent.com` links automatically. Free product download URLs should also use a direct GitHub raw/CDN link. First-login profile records are stored in `userProfiles` with user email, first visit timestamp, referrer/source, and the country/currency selected on the one-time setup page. No browser locale, IP lookup, geolocation, exchange-rate APIs, or event analytics are used.

Admin email:

```text
cocogermany.ytd@gmail.com
```

Suggested order statuses for manual fulfilment:

- `Pending`
- `Payment Requested`
- `Paid`
- `Processing`
- `Shipped`
- `Completed`
- `Cancelled`

## Firestore Security

For version 1, keep the site simple but do not leave Firestore fully open in production. A common starting point is allowing public `create` on `orders` while blocking public reads, updates, and deletes.

## Local Preview

You can open `index.html` directly in a browser for layout review.

For testing Firebase submission, serve the folder with any simple static server, then open the local URL.

## Netlify

This site has no build command.

Publish directory:

```text
.
```


## Country & Currency Setup

After login, users without both `country` and `currency` in `userProfiles/{uid}` are redirected to `#/profile-setup`. Prices are selected from each product's `prices` JSON using the saved profile currency. If that currency is missing, or the user selected `Other`, the site falls back to the `USD` price. Users can update these preferences from My Account -> Profile Settings.
