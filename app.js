/**
 * 책피바라 📚 독서회 아카이브 앱
 * 
 * 기능:
 * - 월별 책 카드 그리드 렌더링
 * - 책 상세 모달 (질문 + 사진)
 * - 어드민 모드 (비밀번호 보호, CRUD)
 * - 파일 직접 업로드 (base64 변환)
 * - JSON 데이터 내보내기
 */

// ===== Constants =====
const MONTH_COLORS = {
  '1월': '#FFB3BA',
  '2월': '#FFDFBA',
  '3월': '#FFFFBA',
  '4월': '#BAFFC9',
  '5월': '#BAF2FF',
  '6월': '#BAD4FF',
  '7월': '#D4BAFF',
  '8월': '#FFBAEB',
  '9월': '#FFB3BA',
  '10월': '#FFDFBA',
  '11월': '#D4FFBA',
  '12월': '#BAEAFF',
};

const ADMIN_PW_KEY = 'chaekpibara_admin_pw';
const DATA_KEY = 'chaekpibara_data';

// ===== State =====
let booksData = { books: [] };
let isAdminMode = false;
let editingBookId = null;
// Temporary storage for uploaded photos during form editing
let tempPhotos = [];

// ===== DOM References =====
const dom = {
  booksGrid: document.getElementById('booksGrid'),
  bookDetailModal: document.getElementById('bookDetailModal'),
  bookDetailContent: document.getElementById('bookDetailContent'),
  passwordModal: document.getElementById('passwordModal'),
  adminPassword: document.getElementById('adminPassword'),
  btnPasswordSubmit: document.getElementById('btnPasswordSubmit'),
  btnAdmin: document.getElementById('btnAdmin'),
  bookFormModal: document.getElementById('bookFormModal'),
  bookFormTitle: document.getElementById('bookFormTitle'),
  bookYear: document.getElementById('bookYear'),
  bookMonth: document.getElementById('bookMonth'),
  bookTitle: document.getElementById('bookTitle'),
  bookAuthor: document.getElementById('bookAuthor'),
  bookCover: document.getElementById('bookCover'),
  bookCoverFile: document.getElementById('bookCoverFile'),
  coverPreview: document.getElementById('coverPreview'),
  questionsEditor: document.getElementById('questionsEditor'),
  photosEditor: document.getElementById('photosEditor'),
  btnAddQuestion: document.getElementById('btnAddQuestion'),
  photoFiles: document.getElementById('photoFiles'),
  btnSaveBook: document.getElementById('btnSaveBook'),
  btnDownload: document.getElementById('btnDownload'),
  toast: document.getElementById('toast'),
  lightbox: document.getElementById('lightbox'),
  lightboxImg: document.getElementById('lightboxImg'),
  mainContent: document.getElementById('mainContent'),
};

// ===== Initialize =====
async function init() {
  await loadData();
  renderBooks();
  bindEvents();
}

// ===== Data Loading =====
async function loadData() {
  // Try localStorage first
  const saved = localStorage.getItem(DATA_KEY);
  if (saved) {
    try {
      booksData = JSON.parse(saved);
      return;
    } catch (e) {
      console.warn('localStorage data corrupted, loading from file.');
    }
  }

  // Fallback to JSON file
  try {
    const response = await fetch('data/books.json');
    if (response.ok) {
      booksData = await response.json();
      saveData();
    }
  } catch (e) {
    console.warn('Could not load books.json:', e);
    booksData = { books: [] };
  }
}

function saveData() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(booksData));
  } catch (e) {
    // localStorage might be full with too many base64 images
    console.warn('localStorage save failed:', e);
    showToast('⚠️ 저장 용량이 부족해요. JSON을 다운로드해주세요.');
  }
}

// ===== File to Base64 Helper =====
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    // Resize image if too large to save localStorage space
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 800; // max width or height
        let { width, height } = img;
        
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== Rendering =====
function renderBooks() {
  const grid = dom.booksGrid;
  grid.innerHTML = '';

  if (booksData.books.length === 0 && !isAdminMode) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state__icon">
          <img src="assets/capybara.png" alt="">
        </div>
        <p class="empty-state__text">아직 등록된 책이 없어요</p>
        <p class="empty-state__subtext">관리자 모드에서 첫 번째 책을 추가해보세요!</p>
      </div>
    `;
    return;
  }

  // Sort books by year and month (newest first)
  const monthOrder = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const sorted = [...booksData.books].sort((a, b) => {
    const yearDiff = (b.year || 2025) - (a.year || 2025);
    if (yearDiff !== 0) return yearDiff;
    return monthOrder.indexOf(b.month) - monthOrder.indexOf(a.month);
  });

  sorted.forEach((book, index) => {
    const card = createBookCard(book, index);
    grid.appendChild(card);
  });

  // Add "new book" card for admin
  const addCard = document.createElement('div');
  addCard.className = 'add-book-card';
  addCard.addEventListener('click', () => openBookForm());
  addCard.innerHTML = `
    <div class="add-book-card__icon">+</div>
    <div class="add-book-card__text">새 책 추가</div>
  `;
  grid.appendChild(addCard);
}

function createBookCard(book, index) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.style.animationDelay = `${index * 0.08}s`;

  const monthColor = MONTH_COLORS[book.month] || '#FFB3BA';
  const yearLabel = book.year ? `${book.year}년 ` : '';

  let coverHTML;
  if (book.cover) {
    coverHTML = `<img src="${book.cover}" alt="${book.title} 표지" class="book-card__cover" onerror="this.parentElement.innerHTML='<div class=\\'book-card__cover-placeholder\\'><span>📚</span><span>표지 없음</span></div>'">`;
  } else {
    coverHTML = `<div class="book-card__cover-placeholder"><span>📚</span><span>표지 없음</span></div>`;
  }

  card.innerHTML = `
    <button class="book-card__delete-btn" data-id="${book.id}" title="삭제">✕</button>
    <div class="book-card__month-label" style="background: ${monthColor}">
      ${yearLabel}${book.month}의 책
    </div>
    <div class="book-card__cover-wrap">
      ${coverHTML}
    </div>
    <div class="book-card__info">
      <div class="book-card__title">${book.title}</div>
      <div class="book-card__author">${book.author}</div>
    </div>
  `;

  // Click to open detail
  card.addEventListener('click', (e) => {
    if (e.target.closest('.book-card__delete-btn')) return;
    openBookDetail(book);
  });

  // Delete button
  const deleteBtn = card.querySelector('.book-card__delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`"${book.title}"을(를) 삭제하시겠습니까?`)) {
      deleteBook(book.id);
    }
  });

  return card;
}

// ===== Book Detail Modal =====
function openBookDetail(book) {
  const monthColor = MONTH_COLORS[book.month] || '#FFB3BA';
  const yearLabel = book.year ? `${book.year}년 ` : '';

  let coverHTML;
  if (book.cover) {
    coverHTML = `<img src="${book.cover}" alt="${book.title}" onerror="this.style.display='none'">`;
  } else {
    coverHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2.5rem;color:var(--text-light);">📚</div>`;
  }

  let questionsHTML;
  if (book.questions && book.questions.length > 0) {
    questionsHTML = `
      <ul class="questions-list">
        ${book.questions.map((q, i) => `<li data-num="${i + 1}">${q}</li>`).join('')}
      </ul>
    `;
  } else {
    questionsHTML = `<div class="no-content">아직 등록된 질문이 없어요</div>`;
  }

  let photosHTML;
  if (book.photos && book.photos.length > 0) {
    photosHTML = `
      <div class="photos-grid">
        ${book.photos.map((p, i) => `<img src="${p}" alt="모임 사진" data-photo-index="${i}" onerror="this.style.display='none'">`).join('')}
      </div>
    `;
  } else {
    photosHTML = `<div class="no-content">아직 등록된 사진이 없어요</div>`;
  }

  // Admin edit button
  const editBtnHTML = isAdminMode 
    ? `<button class="btn-secondary" onclick="openBookForm('${book.id}')" style="margin-top:12px;width:100%;font-size:0.8rem;">✏️ 수정하기</button>` 
    : '';

  dom.bookDetailContent.innerHTML = `
    <div class="book-detail__top">
      <div class="book-detail__cover-wrap">
        ${coverHTML}
      </div>
      <div class="book-detail__meta">
        <span class="book-detail__month" style="background: ${monthColor}">${yearLabel}${book.month}의 책</span>
        <h2 class="book-detail__title">${book.title}</h2>
        <p class="book-detail__author">✍️ ${book.author}</p>
        ${editBtnHTML}
      </div>
    </div>

    <div class="book-detail__section">
      <h3 class="book-detail__section-title">💬 모임 질문</h3>
      ${questionsHTML}
    </div>

    <div class="book-detail__section">
      <h3 class="book-detail__section-title">📸 모임 사진</h3>
      ${photosHTML}
    </div>
  `;

  // Bind photo click for lightbox
  dom.bookDetailContent.querySelectorAll('.photos-grid img').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.src));
  });

  openModal('bookDetailModal');
}

// ===== Admin Mode =====
function toggleAdmin() {
  if (isAdminMode) {
    // Exit admin
    isAdminMode = false;
    document.body.classList.remove('admin-mode');
    dom.btnAdmin.classList.remove('active');
    dom.btnAdmin.textContent = '⚙ 관리';
    showToast('관리자 모드를 종료했습니다');
    renderBooks();
    return;
  }

  // Open password modal
  dom.adminPassword.value = '';
  openModal('passwordModal');
  setTimeout(() => dom.adminPassword.focus(), 300);
}

function handlePasswordSubmit() {
  const pw = dom.adminPassword.value.trim();
  if (!pw) {
    showToast('비밀번호를 입력해주세요');
    return;
  }

  const savedPw = localStorage.getItem(ADMIN_PW_KEY);

  if (!savedPw) {
    // First time: set password
    localStorage.setItem(ADMIN_PW_KEY, pw);
    activateAdmin();
    showToast('관리자 비밀번호가 설정되었습니다!');
  } else if (savedPw === pw) {
    activateAdmin();
    showToast('관리자 모드로 진입했습니다');
  } else {
    showToast('비밀번호가 틀렸습니다');
    dom.adminPassword.value = '';
    dom.adminPassword.focus();
    return;
  }

  closeModal('passwordModal');
}

function activateAdmin() {
  isAdminMode = true;
  document.body.classList.add('admin-mode');
  dom.btnAdmin.classList.add('active');
  dom.btnAdmin.textContent = '🔓 관리 종료';
  renderBooks();
}

// ===== Book Form (Add/Edit) =====
function openBookForm(bookId) {
  editingBookId = bookId || null;
  closeModal('bookDetailModal');

  // Reset file inputs
  dom.bookCoverFile.value = '';
  dom.photoFiles.value = '';
  dom.coverPreview.innerHTML = '';

  if (editingBookId) {
    // Edit mode
    const book = booksData.books.find(b => b.id === editingBookId);
    if (!book) return;

    dom.bookFormTitle.textContent = '✏️ 책 수정';
    dom.bookYear.value = book.year || 2025;
    dom.bookMonth.value = book.month;
    dom.bookTitle.value = book.title;
    dom.bookAuthor.value = book.author;
    dom.bookCover.value = book.cover || '';

    // Show existing cover preview
    if (book.cover) {
      dom.coverPreview.innerHTML = `<img src="${book.cover}" alt="현재 표지">`;
    }

    renderQuestionsEditor(book.questions || []);
    tempPhotos = [...(book.photos || [])];
    renderPhotosEditor();
  } else {
    // Add mode
    dom.bookFormTitle.textContent = '📝 새 책 추가';
    dom.bookYear.value = new Date().getFullYear();
    dom.bookMonth.value = `${new Date().getMonth() + 1}월`;
    dom.bookTitle.value = '';
    dom.bookAuthor.value = '';
    dom.bookCover.value = '';

    renderQuestionsEditor(['']);
    tempPhotos = [];
    renderPhotosEditor();
  }

  setTimeout(() => openModal('bookFormModal'), 100);
}

// Make openBookForm globally accessible for inline onclick
window.openBookForm = openBookForm;

function renderQuestionsEditor(questions) {
  dom.questionsEditor.innerHTML = '';
  questions.forEach((q, i) => {
    addQuestionField(q);
  });
}

function addQuestionField(value = '') {
  const item = document.createElement('div');
  item.className = 'question-item';
  item.innerHTML = `
    <input type="text" class="question-input" value="${escapeHtml(value)}" placeholder="질문을 입력하세요...">
    <button class="btn-remove" type="button">✕</button>
  `;
  item.querySelector('.btn-remove').addEventListener('click', () => item.remove());
  dom.questionsEditor.appendChild(item);
}

function renderPhotosEditor() {
  dom.photosEditor.innerHTML = '';
  tempPhotos.forEach((photoSrc, index) => {
    addPhotoPreview(photoSrc, index);
  });
}

function addPhotoPreview(src, index) {
  const item = document.createElement('div');
  item.className = 'photo-item';
  
  // Truncate display for base64 data
  const displayText = src.startsWith('data:') ? '📷 업로드된 사진' : src.split('/').pop();
  
  item.innerHTML = `
    <img src="${src}" alt="사진 미리보기" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2245%22><text y=%2230%22 font-size=%2220%22>📷</text></svg>'">
    <span>${displayText}</span>
    <button class="btn-remove" type="button">✕</button>
  `;
  
  item.querySelector('.btn-remove').addEventListener('click', () => {
    tempPhotos.splice(index, 1);
    renderPhotosEditor();
  });
  
  dom.photosEditor.appendChild(item);
}

// Handle cover file upload
async function handleCoverUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    showToast('표지 이미지 처리 중...');
    const base64 = await fileToBase64(file);
    dom.bookCover.value = base64;
    dom.coverPreview.innerHTML = `<img src="${base64}" alt="표지 미리보기">`;
    showToast('표지 이미지가 등록되었습니다! 📷');
  } catch (err) {
    showToast('이미지 처리에 실패했어요');
    console.error(err);
  }
}

// Handle photo files upload
async function handlePhotosUpload(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  
  showToast(`${files.length}장의 사진 처리 중...`);
  
  for (const file of files) {
    try {
      const base64 = await fileToBase64(file);
      tempPhotos.push(base64);
    } catch (err) {
      console.error('Photo processing failed:', err);
    }
  }
  
  renderPhotosEditor();
  showToast(`${files.length}장의 사진이 추가되었습니다! 📸`);
  // Reset file input so same files can be selected again
  dom.photoFiles.value = '';
}

function saveBook() {
  const year = parseInt(dom.bookYear.value) || new Date().getFullYear();
  const month = dom.bookMonth.value;
  const title = dom.bookTitle.value.trim();
  const author = dom.bookAuthor.value.trim();
  const cover = dom.bookCover.value.trim();

  if (!title) {
    showToast('책 제목을 입력해주세요');
    return;
  }
  if (!author) {
    showToast('저자명을 입력해주세요');
    return;
  }

  const questions = Array.from(dom.questionsEditor.querySelectorAll('.question-input'))
    .map(input => input.value.trim())
    .filter(q => q.length > 0);

  const photos = [...tempPhotos];

  const monthNum = month.replace('월', '').padStart(2, '0');
  const id = `${year}-${monthNum}`;

  if (editingBookId) {
    // Update
    const idx = booksData.books.findIndex(b => b.id === editingBookId);
    if (idx !== -1) {
      booksData.books[idx] = { id, month, year, title, author, cover, questions, photos };
      showToast(`"${title}" 수정 완료!`);
    }
  } else {
    // Check duplicate
    if (booksData.books.find(b => b.id === id)) {
      showToast('이미 같은 연도/월의 책이 있습니다');
      return;
    }
    booksData.books.push({ id, month, year, title, author, cover, questions, photos });
    showToast(`"${title}" 추가 완료!`);
  }

  saveData();
  renderBooks();
  closeModal('bookFormModal');
  editingBookId = null;
  tempPhotos = [];
}

function deleteBook(bookId) {
  booksData.books = booksData.books.filter(b => b.id !== bookId);
  saveData();
  renderBooks();
  showToast('책이 삭제되었습니다');
}

// ===== JSON Download =====
function downloadJSON() {
  const dataStr = JSON.stringify(booksData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'books.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('books.json 파일이 다운로드되었습니다!');
}

// ===== Modal Helpers =====
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ===== Lightbox =====
function openLightbox(src) {
  dom.lightboxImg.src = src;
  dom.lightbox.classList.add('active');
}

// Make globally accessible
window.openLightbox = openLightbox;

function closeLightbox() {
  dom.lightbox.classList.remove('active');
  dom.lightboxImg.src = '';
}

// ===== Toast =====
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 2500);
}

// ===== Utility =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Event Bindings =====
function bindEvents() {
  // Admin button
  dom.btnAdmin.addEventListener('click', toggleAdmin);

  // Password submit
  dom.btnPasswordSubmit.addEventListener('click', handlePasswordSubmit);
  dom.adminPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePasswordSubmit();
  });

  // Close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      closeModal(modalId);
    });
  });

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // Close with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close lightbox first
      if (dom.lightbox.classList.contains('active')) {
        closeLightbox();
        return;
      }
      // Close any open modal
      document.querySelectorAll('.modal-overlay.active').forEach(overlay => {
        closeModal(overlay.id);
      });
    }
  });

  // Add question button
  dom.btnAddQuestion.addEventListener('click', () => addQuestionField());

  // Cover file upload
  dom.bookCoverFile.addEventListener('change', handleCoverUpload);

  // Photo files upload
  dom.photoFiles.addEventListener('change', handlePhotosUpload);

  // Save book
  dom.btnSaveBook.addEventListener('click', saveBook);

  // Download JSON
  dom.btnDownload.addEventListener('click', downloadJSON);

  // Lightbox close
  dom.lightbox.addEventListener('click', closeLightbox);
}

// ===== Start =====
document.addEventListener('DOMContentLoaded', init);
