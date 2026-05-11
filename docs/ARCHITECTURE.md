# المعمارية الحالية للمشروع

## 1. الويب
- [D:\chicken\index.html](D:\chicken/index.html)
- [D:\chicken\styles\app.source.css](D:\chicken/styles/app.source.css)
- [D:\chicken\styles\app.css](D:\chicken/styles/app.css)
- [D:\chicken\js\runtime-config.js](D:\chicken/js/runtime-config.js)
- [D:\chicken\js\app.js](D:\chicken/js/app.js)

الواجهة الآن:
- Tailwind CSS 4
- PWA
- حسابات عبر API
- تحقق بريد واستعادة كلمة المرور

## 2. الـ API
- [D:\chicken\apps\api\server.cjs](D:\chicken/apps/api/server.cjs)
- [D:\chicken\apps\api\lib](D:\chicken/apps/api/lib)
- [D:\chicken\apps\api\migrations](D:\chicken/apps/api/migrations)
- [D:\chicken\apps\api\scripts](D:\chicken/apps/api/scripts)

الـ API الآن يدعم:
- Postgres
- sessions
- email verification
- password reset
- metrics / health / ready
- JSON backups

## 3. تطبيقات الهاتف
- [D:\chicken\apps\android](D:\chicken/apps/android)
- [D:\chicken\apps\ios](D:\chicken/apps/ios)

كل منصة موجودة كمشروع مستقل داخل المستودع.

## 4. الحزم المشتركة
- [D:\chicken\packages\core](D:\chicken/packages/core)
- [D:\chicken\packages\mobile-shell](D:\chicken/packages/mobile-shell)

## 5. النشر والأتمتة
- الويب:
  - [D:\chicken\vercel.json](D:\chicken/vercel.json)
- الـ API:
  - [D:\chicken\render.yaml](D:\chicken/render.yaml)
- CI/CD:
  - [D:\chicken\.github\workflows\ci.yml](D:\chicken/.github/workflows/ci.yml)
  - [D:\chicken\.github\workflows\deploy-web.yml](D:\chicken/.github/workflows/deploy-web.yml)
  - [D:\chicken\.github\workflows\deploy-api.yml](D:\chicken/.github/workflows/deploy-api.yml)
  - [D:\chicken\.github\workflows\monitor-production.yml](D:\chicken/.github/workflows/monitor-production.yml)
