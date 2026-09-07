# چک‌لیست امنیتی استقرار — سیستم مدیریت درویشی

این سند دقیقاً بر اساس چک‌لیستی که ارسال کردید سازمان‌دهی شده. جلوی هر مورد نوشته شده که **در کد این برنامه انجام شده** یا **باید روی خود سرور (VPS) انجام بدهید** (چون این‌ها تنظیمات سیستم‌عامل/شبکه هستند، نه چیزی که کد یک اپلیکیشن Node.js بتواند خودش انجام دهد).

## ۱. سیستم‌عامل و دسترسی — روی سرور انجام دهید

```bash
# ورود فقط با کلید SSH (روی سیستم خودتان کلید بسازید، مثال زیر را در سرور اجرا نکنید):
#   ssh-keygen -t ed25519 -C "darvishi-admin"
#   ssh-copy-id -p 22 root@IP_SERVER

# روی سرور، فایل تنظیمات SSH را باز کنید:
sudo nano /etc/ssh/sshd_config

# این مقادیر را تنظیم کنید:
#   PermitRootLogin no
#   PasswordAuthentication no
#   Port 2222        (یا هر پورت غیر ۲۲ دلخواه — یادتان بماند در فایروال هم باز کنید)

sudo systemctl restart sshd

# نصب Fail2Ban برای مسدودسازی خودکار IPهای مشکوک:
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

⚠️ قبل از بستن `PasswordAuthentication`، حتماً مطمئن شوید ورود با کلید SSH از یک ترمینال دیگر برایتان کار می‌کند — وگرنه ممکن است خودتان هم قفل شوید.

## ۲. فایروال — روی سرور انجام دهید

```bash
sudo apt install -y ufw
sudo ufw allow 2222/tcp     # همان پورت جدید SSH که در بخش ۱ تنظیم کردید
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo ufw status
```

پورت 3000 (که Node روی آن گوش می‌دهد) **عمداً باز نمی‌شود** — طبق بخش ۳ زیر، Node فقط روی localhost گوش می‌دهد و از بیرون اصلاً در دسترس نیست، فقط Nginx با آن صحبت می‌کند.

## ۳. اجرای اپلیکیشن

**در کد انجام شده:** با متغیر محیطی `HOST=127.0.0.1` (در فایل `.env`)، Node فقط روی localhost گوش می‌دهد نه روی همه‌ی شبکه — یعنی حتی اگر کسی فایروال را دور بزند، مستقیم به Node نمی‌رسد.

**روی سرور انجام دهید:**
```bash
# یک کاربر غیر root بسازید و اپ را با همان کاربر اجرا کنید:
sudo adduser darvishi
sudo su - darvishi
# (سپس پروژه را در home همین کاربر کپی/کلون کنید و از همینجا ادامه دهید)

npm install -g pm2
cd ~/darvishi-crm
npm install
cp .env.example .env
nano .env   # SESSION_SECRET را با یک مقدار تصادفی پر کنید؛ HOST=127.0.0.1 و TRUST_PROXY=true و FORCE_SECURE_COOKIE=true را هم تنظیم کنید (چون پشت Nginx+HTTPS خواهید بود)

pm2 start server.js --name darvishi-crm
pm2 save
pm2 startup   # دستوری که چاپ می‌کند را کپی و با sudo اجرا کنید
```

⚠️ **این پروژه را همیشه با یک Process اجرا کنید** — دستور بالا (بدون `-i`) این کار را می‌کند و همین‌طور نگهش دارید. **هرگز** از `pm2 start server.js -i max` یا هر حالت Cluster دیگری استفاده نکنید: کل داده‌ها (رکوردها، رزروها، ظرفیت پرواز و غیره) در حافظه‌ی یک Process نگه‌داری و کش می‌شود، پس چند Process همزمان یعنی چند نسخه‌ی ناسازگار از داده که می‌توانند رزرو/ظرفیت را خراب کنند. اگر بعداً نیاز به مقیاس بزرگ‌تر (چند Process/چند سرور) پیدا کردید، اول باید لایه دیتابیس (`db.js`) طوری بازنویسی شود که مستقیماً از SQLite بخواند/بنویسد نه از کش حافظه.

## ۴. HTTPS و Nginx — روی سرور انجام دهید

فایل آماده‌ی `nginx-darvishi.conf` (کنار همین سند) را استفاده کنید — شامل Reverse Proxy، HSTS، و تمام هدرهای امنیتی درخواستی شماست:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp nginx-darvishi.conf /etc/nginx/sites-available/darvishi
sudo nano /etc/nginx/sites-available/darvishi   # your-domain.com را با دامنه واقعی‌تان جایگزین کنید
sudo ln -s /etc/nginx/sites-available/darvishi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

sudo certbot --nginx -d your-domain.com   # گواهی رایگان را نصب و HTTPS را فعال می‌کند
sudo systemctl status certbot.timer       # تمدید خودکار را تأیید کنید (به‌صورت پیش‌فرض فعال است)
```

## ۵. تنظیمات Session — در کد انجام شده

- `SESSION_SECRET`: در `server.js` اگر مقدار پیش‌فرض ناامن باشد هشدار می‌دهد؛ شما در `.env` مقدار واقعی می‌گذارید.
- کوکی: `httpOnly: true` و `sameSite: 'strict'` همیشه فعال است. `secure: true` وقتی فعال می‌شود که `FORCE_SECURE_COOKIE=true` در `.env` باشد (یعنی وقتی واقعاً پشت HTTPS هستید — قبل از آن روشنش نکنید، وگرنه لاگین کار نمی‌کند).
- `trust proxy`: فقط وقتی `TRUST_PROXY=true` باشد فعال می‌شود (یعنی وقتی واقعاً پشت Nginx هستید) — چون فعال کردنش بدون یک پراکسی واقعی به کاربر امکان جعل IP خودش را می‌دهد.

## ۶. امنیت داده

**در کد انجام شده:**
- فایل‌های دیتابیس (`data/darvishi.db` و `data/darvishi-sql.db`) در حالت WAL اجرا می‌شوند (نوشتن هیچ‌وقت خواندن را قفل نمی‌کند) و هر بار پس از نوشتن، دسترسی فایل به `600` (فقط قابل خواندن/نوشتن توسط همان کاربر) محدود می‌شود.

**روی سرور انجام دهید:**
```bash
# بک‌آپ روزانه‌ی امن (حتی وقتی سرور روشن است — از API رسمی بک‌آپ SQLite استفاده می‌کند، نه کپی خام فایل).
# node backup-db.js هر دو فایل (darvishi.db و darvishi-sql.db) را با یک timestamp مشترک بک‌آپ می‌گیرد؛
# بک‌آپ فقط یکی از این دو کافی نیست — رکوردهای فروش و رزروها در darvishi-sql.db هستند.
mkdir -p ~/backups
crontab -e
# این خط را اضافه کنید (هر شب ساعت ۳):
0 3 * * * cd ~/darvishi-crm && node backup-db.js ~/backups/darvishi-$(date +\%F).db && for f in ~/backups/darvishi-$(date +\%F).db ~/backups/darvishi-sql-$(date +\%F).db; do gpg --batch --yes --passphrase "YOUR_PASSPHRASE" -c "$f" && rm "$f"; done && find ~/backups -name "darvishi*.db.gpg" -mtime +30 -delete
# قسمت آخر (find ...‎ -delete) بک‌آپ‌های رمزنگاری‌شده‌ی قدیمی‌تر از ۳۰ روز را پاک می‌کند — بدون این خط، پوشه‌ی backups هر شب بزرگ‌تر می‌شود و هیچ‌وقت خودش کوچک نمی‌شود (نسخه‌ی ویندوزی این پروژه، backup-data.ps1، از قبل همین کار را برای کاربران ویندوز انجام می‌داد).

# بازیابی یک بک‌آپ در آینده (در صورت نیاز — سرور را متوقف کنید، هر دو فایل را بازیابی کنید، دوباره اجرا کنید):
#   pm2 stop darvishi-crm
#   gpg --batch --yes --passphrase "YOUR_PASSPHRASE" -d -o data/darvishi.db darvishi-2026-09-03.db.gpg
#   gpg --batch --yes --passphrase "YOUR_PASSPHRASE" -d -o data/darvishi-sql.db darvishi-sql-2026-09-03.db.gpg
#   pm2 start darvishi-crm
```
- در تنظیمات Nginx (فایل نمونه پیوست)، هیچ مسیری به پوشه‌ی `data/` باز نشده — فقط درخواست‌ها به Node پراکسی می‌شوند، پس دسترسی مستقیم به `darvishi.db` یا `darvishi-sql.db` از طریق مرورگر ممکن نیست.

## ۷. امنیت اپلیکیشن — در کد انجام شده

- **Helmet** فعال است (هدرهای امنیتی پایه مثل X-Content-Type-Options، X-Frame-Options).
- **Rate Limiting روی لاگین**: حداکثر ۱۵ تلاش هر ۱۰ دقیقه به‌ازای هر IP.
- **محدودیت اندازه درخواست**: بدنه‌ی هر درخواست حداکثر ۲ مگابایت.
- **پاک‌سازی فایل credentials اولیه**: به‌محض اینکه توسعه‌دهنده رمز اولیه را از داخل برنامه عوض کند، فایل `INITIAL_DEVELOPER_CREDENTIALS.txt` خودکار حذف می‌شود.

## ۸. نگهداری

**روی سرور انجام دهید:**
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # به‌روزرسانی امنیتی خودکار سیستم‌عامل
```
- **مانیتورینگ فعالیت**: به‌جای مانیتور کردن تغییرات فایل در سطح سیستم‌عامل، این برنامه یک **تب مانیتورینگ داخلی** دارد (فقط برای نقش‌های مجاز) که ورود هر کاربر در هر ساعت شبانه‌روز، کاربران آنلاین، و وضعیت سرور را نشان می‌دهد — و در صورت تنظیم یک ربات تلگرام، با هر ورود یک پیام هم برایتان ارسال می‌شود. جزئیات در README بخش «امکانات».
- **Snapshot سرور**: از پنل ارائه‌دهنده‌ی VPS خودتان (اکثر ارائه‌دهنده‌ها این قابلیت را دارند)، یک Snapshot هفتگی برنامه‌ریزی کنید — این کاملاً بیرون از اپلیکیشن و مستقل از آن انجام می‌شود.
