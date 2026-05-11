# دليل النشر: الويب والـ API والهاتف

## 1. الويب

- النشر المقترح: `Vercel`
- الملف المسؤول: [D:\chicken\vercel.json](D:\chicken\vercel.json)
- قبل النشر:
  - توليد [D:\chicken\js\runtime-config.js](D:\chicken\js\runtime-config.js)
  - بناء [D:\chicken\styles\app.css](D:\chicken\styles\app.css)

## 2. الـ API

- النشر المقترح: `Render`
- الملف المسؤول: [D:\chicken\render.yaml](D:\chicken\render.yaml)
- الخادم يعتمد الآن على:
  - `Postgres`
  - `Email verification / reset`
  - `Health / ready / metrics`

## 3. قاعدة البيانات

- البيئة المستهدفة: Postgres سحابي
- الترحيل من SQLite صار متاحًا عبر:
  - `npm run api:migrate`
  - `npm run api:migrate:sqlite`

## 4. الدومين وHTTPS

- الويب:
  - `https://app.yourdomain.com`
- الـ API:
  - `https://api.yourdomain.com`
- يجب تحديث:
  - `WEB_BASE_URL`
  - `API_BASE_URL`
  - `PUBLIC_WEB_BASE_URL`
  - `PUBLIC_API_BASE_URL`
  - `ALLOWED_ORIGINS`

## 5. البريد والتحقق

- مزود البريد المقترح: `Resend`
- متغيرات البيئة الأساسية:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
- المسارات المدعومة:
  - التحقق من البريد
  - إعادة إرسال رابط التحقق
  - نسيان كلمة المرور
  - إعادة تعيين كلمة المرور

## 6. المراقبة والنسخ الاحتياطي

- فحص الصحة:
  - `GET /api/health`
  - `GET /api/ready`
  - `GET /api/metrics`
- نسخ احتياطي:
  - `npm run api:backup`
- Workflow متابعة:
  - [D:\chicken\.github\workflows\monitor-production.yml](D:\chicken/.github/workflows/monitor-production.yml)

## 7. GitHub Actions

- التحقق المستمر:
  - [D:\chicken\.github\workflows\ci.yml](D:\chicken/.github/workflows/ci.yml)
- نشر الويب:
  - [D:\chicken\.github\workflows\deploy-web.yml](D:\chicken/.github/workflows/deploy-web.yml)
- نشر الـ API:
  - [D:\chicken\.github\workflows\deploy-api.yml](D:\chicken/.github/workflows/deploy-api.yml)

## 8. الهاتف

- التطبيقات موجودة داخل:
  - [D:\chicken\apps\android](D:\chicken/apps/android)
  - [D:\chicken\apps\ios](D:\chicken/apps/ios)
- عند توحيد الـ API والدومين الإنتاجي، يمكن ربط الهاتف بنفس الحسابات والبيانات مباشرة
