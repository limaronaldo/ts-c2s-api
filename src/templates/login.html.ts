/**
 * Login Page Template (RML-811)
 *
 * Custom login page with MBRAS branding.
 * Colors: Navy Blue (#1a3a5c), Gold (#b8a06a)
 */

export function generateLoginHtml(error?: string): string {
  const errorHtml = error
    ? `<div class="error-message">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        ${error}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login | MBRAS Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --mbras-navy: #1a3a5c;
      --mbras-navy-dark: #132b45;
      --mbras-gold: #b8a06a;
      --mbras-gold-light: #c9b483;
      --mbras-gold-dark: #9a8555;
      --mbras-gray: #f5f5f5;
      --mbras-gray-dark: #e5e5e5;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--mbras-navy) 0%, var(--mbras-navy-dark) 100%);
      padding: 20px;
    }

    .login-container {
      width: 100%;
      max-width: 420px;
      animation: fadeIn 0.6s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .login-card {
      background: white;
      border-radius: 16px;
      padding: 48px 40px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
    }

    .logo-section {
      text-align: center;
      margin-bottom: 36px;
    }

    .logo {
      width: 100px;
      height: 100px;
      margin: 0 auto 24px;
    }

    .logo svg {
      width: 100%;
      height: 100%;
    }

    .title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 28px;
      font-weight: 600;
      color: var(--mbras-navy);
      margin-bottom: 8px;
      letter-spacing: 2px;
    }

    .subtitle {
      font-size: 13px;
      color: #6b7280;
      font-weight: 400;
      letter-spacing: 0.5px;
    }

    .error-message {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .error-message svg {
      flex-shrink: 0;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--mbras-navy);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .form-input {
      width: 100%;
      padding: 14px 16px;
      font-size: 15px;
      border: 2px solid var(--mbras-gray-dark);
      border-radius: 8px;
      background: var(--mbras-gray);
      color: var(--mbras-navy);
      transition: all 0.2s ease;
      font-family: inherit;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--mbras-gold);
      background: white;
      box-shadow: 0 0 0 3px rgba(184, 160, 106, 0.15);
    }

    .form-input::placeholder {
      color: #9ca3af;
    }

    .submit-btn {
      width: 100%;
      padding: 16px;
      font-size: 14px;
      font-weight: 600;
      color: white;
      background: var(--mbras-navy);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 8px;
      font-family: inherit;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .submit-btn:hover {
      background: var(--mbras-gold);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(184, 160, 106, 0.4);
    }

    .submit-btn:active {
      transform: translateY(0);
    }

    .divider {
      display: flex;
      align-items: center;
      margin: 28px 0;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--mbras-gray-dark);
    }

    .divider-icon {
      padding: 0 16px;
      color: var(--mbras-gold);
    }

    .footer {
      text-align: center;
      margin-top: 24px;
    }

    .footer-text {
      font-size: 12px;
      color: #9ca3af;
    }

    .footer-link {
      color: var(--mbras-gold-dark);
      text-decoration: none;
      font-weight: 500;
    }

    .footer-link:hover {
      color: var(--mbras-gold);
      text-decoration: underline;
    }

    .security-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 16px;
      font-size: 11px;
      color: #9ca3af;
    }

    .security-badge svg {
      width: 14px;
      height: 14px;
      color: var(--mbras-gold);
    }

    /* Loading state */
    .submit-btn.loading {
      pointer-events: none;
      opacity: 0.8;
    }

    .submit-btn.loading::after {
      content: '';
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid transparent;
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-left: 10px;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Responsive */
    @media (max-width: 480px) {
      .login-card {
        padding: 32px 24px;
      }

      .title {
        font-size: 24px;
      }

      .logo {
        width: 80px;
        height: 80px;
      }
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-card">
      <div class="logo-section">
        <!-- MBRAS Logo -->
        <div class="logo">
          <img src="/icon-mbras.png" alt="MBRAS" />
        </div>
        <h1 class="title">MBRAS</h1>
        <p class="subtitle">Painel de Enriquecimento de Leads</p>
      </div>

      ${errorHtml}

      <form method="POST" action="/dashboard/login" id="loginForm">
        <div class="form-group">
          <label class="form-label" for="username">Usuário</label>
          <input
            type="text"
            id="username"
            name="username"
            class="form-input"
            placeholder="Digite seu usuário"
            autocomplete="username"
            required
            autofocus
          >
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Senha</label>
          <input
            type="password"
            id="password"
            name="password"
            class="form-input"
            placeholder="Digite sua senha"
            autocomplete="current-password"
            required
          >
        </div>

        <button type="submit" class="submit-btn" id="submitBtn">
          Entrar
        </button>
      </form>

      <div class="divider">
        <span class="divider-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </span>
      </div>

      <div class="footer">
        <p class="footer-text">
          Acesso restrito à equipe <a href="https://mbras.com.br" target="_blank" class="footer-link">MBRAS</a>
        </p>
        <div class="security-badge">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Conexão segura via HTTPS
        </div>
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', function() {
      submitBtn.classList.add('loading');
      submitBtn.textContent = 'Entrando';
    });
  </script>
</body>
</html>`;
}
