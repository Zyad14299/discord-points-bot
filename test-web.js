// سكريبت بسيط لاختبار الخادم
const http = require('http');

console.log('جاري اختبار الخادم...');

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`استجابة الخادم: ${res.statusCode}`);
  if (res.statusCode === 200) {
    console.log('الخادم يعمل بشكل صحيح!');
  } else {
    console.log('هناك مشكلة في الخادم');
  }
  process.exit(0);
});

req.on('error', (error) => {
  console.error('خطأ في الاتصال بالخادم:', error.message);
  console.log('تأكد من أن الخادم شغال على المنفذ 3002');
  process.exit(1);
});

req.end();