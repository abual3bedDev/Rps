# RPS Arena

<div align="center">

![HTML](https://img.shields.io/badge/HTML-واجهة%20التطبيق-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-التصميم%20والثيمات-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-المنطق%20والتفاعل-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111111)
![Supabase](https://img.shields.io/badge/Supabase-قاعدة%20البيانات%20والتوثيق-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

تجربة **Rock Paper Scissors** حديثة تركّز على **الأصدقاء، الرانكات، النقاط، والغرف الخاصة** داخل واجهة عصرية مع `Light / Dark Theme`.

</div>

---

## نبذة

`RPS Arena` هو مشروع لعبة حجر ورقة مقص لكن بشكل أوسع من اللعبة التقليدية.
بدل صفحة لعب بسيطة، المشروع يقدم:

- نظام حساب وتسجيل دخول عبر Supabase
- لوحة تحكم حديثة
- نقاط ورانكات
- أصدقاء وطلبات صداقة
- غرف خاصة وعامة
- Arena منفصلة للمباراة
- مؤقت جولات واختيار تلقائي عند انتهاء الوقت
- سجل لآخر 5 مباريات

---

## أهم الميزات

### لوحة التحكم

- عرض `Points / Rank / Wins / Losses`
- عرض `Friend Code`
- نافذة منبثقة لسلم الرانكات
- دعم الثيم الفاتح والداكن

### الـ Arena

- إخفاء اختيار الخصم حتى يختار الطرفان
- مؤقت لكل جولة
- اختيار تلقائي عند انتهاء الوقت
- Reactions داخل المباراة
- ملخص نهائي يوضح تغيّر النقاط والرانك

### النظام الاجتماعي

- إرسال واستقبال طلبات الصداقة
- ترتيب خاص بالأصدقاء
- تجربة خاصة أكثر من Leaderboard عالمي مفتوح

---

## التقنيات المستخدمة

- `HTML`
- `CSS`
- `Vanilla JavaScript`
- `Supabase`

---

## تشغيل المشروع محليًا

يفضل تشغيل المشروع من خلال `localhost` بدل الفتح المباشر عبر `file://`.

مثال:

```powershell
py -m http.server 5500
```

ثم افتح:

```text
http://localhost:5500
```

---

## إعداد Supabase

الملف المسؤول عن الإعدادات هو:

```text
supabase-config.js
```

ويجب أن يحتوي على:

- `supabaseUrl`
- `supabaseAnonKey`

مهم:

- لا تضع `service_role key` داخل ملفات الفرونت أبدًا
- الحماية الحقيقية تكون عبر `RLS Policies` داخل Supabase

---

## ملفات المشروع

- `index.html`
  هيكل التطبيق والواجهات

- `style.css`
  التصميم الكامل، الثيمات، والأنيميشن

- `script.js`
  منطق اللعب، الحساب، الغرف، الرانكات، والتفاعل اللحظي

- `supabase-config.js`
  إعدادات الاتصال مع Supabase

---

## ملاحظات

- المشروع موجه للعمل داخل المتصفح مباشرة
- يمكن تطويره لاحقًا إلى بنية أكبر باستخدام `Vite` أو backend منفصل
- يفضل ضبط `RLS` بشكل جيد قبل استخدامه بشكل فعلي

---

## المطور

- GitHub: [abual3bedDev](https://github.com/abual3bedDev)
