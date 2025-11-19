import { config } from './env.local.js';

class ChatApp {
  constructor() {
    this.supabase = supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    this.currentUser = null;
    this.currentChatId = null;
    this.chats = new Map();
    
    this.init();
  }

  async init() {
    await this.checkAuth();
    this.loadChatsFromStorage();
    this.setupEventListeners();
    this.renderChatList();
    this.showCurrentChat();
  }

  async checkAuth() {
    const { data: { session }, error } = await this.supabase.auth.getSession();
    
    if (session?.user) {
      this.currentUser = session.user;
      if (window.location.pathname.includes('login.html') || 
          window.location.pathname.includes('signup.html')) {
        window.location.href = 'index.html';
      }
    } else {
      if (!window.location.pathname.includes('login.html') && 
          !window.location.pathname.includes('signup.html')) {
        window.location.href = 'login.html';
      }
    }
  }

  async handleSignup(email, password, fullName) {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;
      
      if (data.user) {
        window.location.href = 'index.html';
      }
    } catch (error) {
      this.showError(error.message);
    }
  }

  async handleLogin(email, password) {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      
      window.location.href = 'index.html';
    } catch (error) {
      this.showError(error.message);
    }
  }

  async handleLogout() {
    await this.supabase.auth.signOut();
    window.location.href = 'login.html';
  }

  showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    } else {
      alert(message);
    }
  }

  // Chat Management
  createNewChat() {
    const chatId = 'chat_' + Date.now();
    this.currentChatId = chatId;
    this.chats.set(chatId, {
      title: 'New Chat',
      messages: []
    });
    
    this.saveChatsToStorage();
    this.renderChatList();
    this.showCurrentChat();
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.focus();
    }
  }

  deleteChat(chatId) {
    this.chats.delete(chatId);
    
    if (this.currentChatId === chatId) {
      const remainingChats = Array.from(this.chats.keys());
      this.currentChatId = remainingChats.length > 0 ? remainingChats[0] : null;
    }
    
    this.saveChatsToStorage();
    this.renderChatList();
    this.showCurrentChat();
  }

  setChatTitle(chatId, title) {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.title = title.substring(0, 20) + (title.length > 20 ? '...' : '');
      this.saveChatsToStorage();
      this.renderChatList();
    }
  }

  async sendMessage(content) {
    if (!content.trim()) return;

    if (!this.currentChatId) {
      this.createNewChat();
    }

    const chat = this.chats.get(this.currentChatId);
    
    // Add user message
    const userMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString()
    };
    
    chat.messages.push(userMessage);
    
    // Set chat title from first message
    if (chat.messages.length === 1) {
      this.setChatTitle(this.currentChatId, content);
    }
    
    this.saveChatsToStorage();
    this.renderMessages();
    
    // Show typing indicator
    this.showTypingIndicator();
    
    try {
      const response = await fetch(`https://ahrarshah-api.vercel.app/api/ai?prompt=${encodeURIComponent(content)}`);
      
      if (!response.ok) throw new Error('API request failed');
      
      const botResponse = await response.text();
      
      // Remove typing indicator
      this.removeTypingIndicator();
      
      // Clean the response
      const cleanedResponse = this.cleanAIResponse(botResponse);
      
      // Add bot message
      const botMessage = {
        role: 'bot',
        content: cleanedResponse,
        timestamp: new Date().toISOString()
      };
      
      chat.messages.push(botMessage);
      this.saveChatsToStorage();
      this.renderMessages();
      
    } catch (error) {
      this.removeTypingIndicator();
      
      const errorMessage = {
        role: 'bot',
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      chat.messages.push(errorMessage);
      this.saveChatsToStorage();
      this.renderMessages();
    }
  }

  cleanAIResponse(text) {
    // Remove common unwanted patterns and symbols
    return text
      .replace(/\/\/.*$/gm, '') // Remove // comments
      .replace(/--.*$/gm, '')   // Remove -- comments
      .replace(/\.-+/g, '.')    // Remove .- patterns
      .replace(/''+/g, "'")     // Clean up quotes
      .replace(/==+/g, '=')     // Clean up equals
      .replace(/\*\*\*+/g, '')  // Remove excessive asterisks
      .replace(/\-\-\-+/g, '')  // Remove excessive dashes
      .replace(/\.{3,}/g, '...') // Normalize ellipses
      .trim();
  }

  showTypingIndicator() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
      <div class="message-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  removeTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  renderMessages() {
    const messagesContainer = document.getElementById('messagesContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (!messagesContainer) return;

    const chat = this.currentChatId ? this.chats.get(this.currentChatId) : null;
    
    if (!chat || chat.messages.length === 0) {
      messagesContainer.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    messagesContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    messagesContainer.innerHTML = chat.messages.map(message => `
      <div class="message ${message.role}">
        <div class="message-bubble ${message.isError ? 'error' : ''}">
          ${this.escapeHtml(message.content)}
        </div>
      </div>
    `).join('');
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  renderChatList() {
    const chatList = document.getElementById('chatList');
    const emptyChats = document.getElementById('emptyChats');
    
    if (!chatList) return;

    if (this.chats.size === 0) {
      chatList.style.display = 'none';
      if (emptyChats) emptyChats.style.display = 'block';
      return;
    }

    chatList.style.display = 'block';
    if (emptyChats) emptyChats.style.display = 'none';
    
    chatList.innerHTML = Array.from(this.chats.entries()).map(([chatId, chat]) => `
      <div class="chat-item ${chatId === this.currentChatId ? 'active' : ''}" 
           onclick="chatApp.selectChat('${chatId}')">
        <div class="chat-title">${this.escapeHtml(chat.title)}</div>
        <button class="delete-chat" onclick="event.stopPropagation(); chatApp.deleteChat('${chatId}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `).join('');
  }

  selectChat(chatId) {
    this.currentChatId = chatId;
    this.saveChatsToStorage();
    this.renderChatList();
    this.showCurrentChat();
  }

  showCurrentChat() {
    const chatTitleHeader = document.getElementById('chatTitleHeader');
    
    if (chatTitleHeader) {
      const chat = this.currentChatId ? this.chats.get(this.currentChatId) : null;
      chatTitleHeader.textContent = chat ? chat.title : 'New Chat';
    }
    
    this.renderMessages();
  }

  // Storage
  loadChatsFromStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem('maddevai_chats');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.chats = new Map(Object.entries(parsed.chats || {}));
        this.currentChatId = parsed.currentChatId;
      }
    }
  }

  saveChatsToStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('maddevai_chats', JSON.stringify({
        chats: Object.fromEntries(this.chats),
        currentChatId: this.currentChatId
      }));
    }
  }

  // Utility
  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, '<br>');
  }

  // Event Listeners
  setupEventListeners() {
    // Auth forms
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');
    
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(signupForm);
        this.handleSignup(
          formData.get('email'),
          formData.get('password'),
          formData.get('fullName')
        );
      });
    }
    
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        this.handleLogin(
          formData.get('email'),
          formData.get('password')
        );
      });
    }
    
    // Chat functionality
    const newChatBtn = document.getElementById('newChatBtn');
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const overlay = document.getElementById('overlay');
    
    if (newChatBtn) {
      newChatBtn.addEventListener('click', () => this.createNewChat());
    }
    
    if (sendBtn && messageInput) {
      sendBtn.addEventListener('click', () => {
        const content = messageInput.value.trim();
        if (content) {
          this.sendMessage(content);
          messageInput.value = '';
          messageInput.style.height = 'auto';
        }
      });
      
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
      
      // Auto-resize textarea
      messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      });
    }
    
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
    
    // Mobile menu
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('overlay').classList.add('active');
      });
    }
    
    if (overlay) {
      overlay.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        overlay.classList.remove('active');
      });
    }
    
    // Update profile info
    this.updateProfileInfo();
  }

  updateProfileInfo() {
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const avatar = document.getElementById('avatar');
    
    if (profileName && this.currentUser?.user_metadata?.full_name) {
      profileName.textContent = this.currentUser.user_metadata.full_name;
    } else if (profileName && this.currentUser?.email) {
      profileName.textContent = this.currentUser.email.split('@')[0];
    }
    
    if (profileEmail && this.currentUser?.email) {
      profileEmail.textContent = this.currentUser.email;
    }
    
    if (avatar && this.currentUser) {
      const name = this.currentUser.user_metadata?.full_name || this.currentUser.email;
      avatar.textContent = name.charAt(0).toUpperCase();
    }
  }
}

// Initialize app
const chatApp = new ChatApp();
window.chatApp = chatApp;
