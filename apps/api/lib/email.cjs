const { Resend } = require("resend");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createEmailClient(config) {
  const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

  async function sendEmail({ to, subject, html, text }) {
    if (!resend || !config.emailFrom) {
      console.log("[farm-api] email preview", JSON.stringify({ to, subject, text }, null, 2));
      return { ok: true, preview: true };
    }

    await resend.emails.send({
      from: config.emailFrom,
      to,
      subject,
      html,
      text,
    });
    return { ok: true, preview: false };
  }

  async function sendVerificationEmail({ to, fullName, verifyUrl }) {
    const safeName = escapeHtml(fullName);
    const safeUrl = escapeHtml(verifyUrl);
    return sendEmail({
      to,
      subject: "تأكيد بريدك الإلكتروني - نظام إدارة المزرعة",
      text: `مرحبًا ${fullName}،\n\nاضغط على الرابط التالي لتأكيد بريدك الإلكتروني:\n${verifyUrl}\n\nإذا لم تطلب هذا الحساب، تجاهل هذه الرسالة.`,
      html: `
        <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;line-height:1.8">
          <h2>تأكيد البريد الإلكتروني</h2>
          <p>مرحبًا ${safeName}،</p>
          <p>اضغط على الزر التالي لتأكيد بريدك الإلكتروني وربط مزرعتك بالحساب بشكل كامل.</p>
          <p><a href="${safeUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">تأكيد البريد</a></p>
          <p>أو استخدم هذا الرابط مباشرة:</p>
          <p><a href="${safeUrl}">${safeUrl}</a></p>
        </div>
      `,
    });
  }

  async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
    const safeName = escapeHtml(fullName);
    const safeUrl = escapeHtml(resetUrl);
    return sendEmail({
      to,
      subject: "إعادة تعيين كلمة المرور - نظام إدارة المزرعة",
      text: `مرحبًا ${fullName}،\n\nلإعادة تعيين كلمة المرور استخدم الرابط التالي:\n${resetUrl}\n\nإذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.`,
      html: `
        <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;line-height:1.8">
          <h2>إعادة تعيين كلمة المرور</h2>
          <p>مرحبًا ${safeName}،</p>
          <p>اضغط على الزر التالي لإدخال كلمة مرور جديدة لحسابك.</p>
          <p><a href="${safeUrl}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">إعادة تعيين كلمة المرور</a></p>
          <p>أو استخدم هذا الرابط مباشرة:</p>
          <p><a href="${safeUrl}">${safeUrl}</a></p>
        </div>
      `,
    });
  }

  return {
    sendVerificationEmail,
    sendPasswordResetEmail,
  };
}

module.exports = {
  createEmailClient,
};
