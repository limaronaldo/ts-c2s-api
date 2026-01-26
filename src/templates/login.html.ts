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
          <img src="data:image/png;base64,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" alt="MBRAS" />
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
