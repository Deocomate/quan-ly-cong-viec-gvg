// Nội dung email giao dịch (đặt lại mật khẩu, lời mời). Hàm thuần, có kiểm thử.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function layout(name, intro, buttonLabel, url, outro) {
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2b2724">` +
    `<p>Chào ${esc(name)},</p><p>${esc(intro)}</p>` +
    `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#2b2724;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">${esc(buttonLabel)}</a></p>` +
    `<p style="color:#5c544d;font-size:13px">Nếu nút không bấm được, hãy dán đường dẫn này vào trình duyệt:<br><span style="word-break:break-all">${esc(url)}</span></p>` +
    `<p style="color:#8a8178;font-size:12px">${esc(outro)}</p></div>`
  const text = `Chào ${name},\n\n${intro}\n\n${buttonLabel}: ${url}\n\n${outro}`
  return { html, text }
}

export function resetPasswordMail({ name, url }) {
  return {
    subject: 'Đặt lại mật khẩu — Trung tâm điều hành',
    ...layout(
      name,
      'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Liên kết có hiệu lực trong thời gian ngắn và chỉ dùng được một lần.',
      'Đặt mật khẩu mới',
      url,
      'Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.',
    ),
  }
}

export function invitationMail({ name, inviter, url }) {
  return {
    subject: 'Lời mời tham gia Trung tâm điều hành',
    ...layout(
      name,
      `${inviter || 'Quản trị viên'} đã mời bạn tham gia Trung tâm điều hành. Hãy đăng ký bằng đúng địa chỉ email nhận thư này để tài khoản được kích hoạt tự động.`,
      'Đăng ký tài khoản',
      url,
      'Nếu bạn không biết lời mời này, hãy bỏ qua email.',
    ),
  }
}

export function restoredAccountMail({ name, url }) {
  return {
    subject: 'Đặt mật khẩu cho tài khoản — Trung tâm điều hành',
    ...layout(
      name,
      'Hệ thống vừa được khôi phục từ bản sao lưu và tài khoản của bạn đã được tạo lại. Vì mật khẩu cũ không nằm trong bản sao lưu, hãy đặt mật khẩu mới để tiếp tục.',
      'Đặt mật khẩu',
      url,
      'Liên kết chỉ dùng được một lần. Nếu hết hạn, dùng "Quên mật khẩu" ở trang đăng nhập.',
    ),
  }
}
