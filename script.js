// ============================================
// استيراد الإعدادات والخدمات
// ============================================
import firebaseConfig from "./firebase.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  deleteDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================
// الحالة العامة
// ============================================
let currentUser = null;
let currentUserData = null;
let unsubscribeUserDoc = null;
let unsubscribePosts = null;
let postsCache = {};
let currentCategory = "all";
let editingPostId = null;
let pendingSignupRole = null;

const CATEGORIES = {
  all:        { name: "جميع المنشورات",        icon: "📚" },
  quran:      { name: "القرآن",                 icon: "📖" },
  sunnah:     { name: "السنة الشريفة",          icon: "🕌" },
  companions: { name: "قصص الصحابة",            icon: "⭐" },
  taifa:      { name: "إخوان الطائفة المنصورة", icon: "🤝" }
};

// ============================================
// عناصر DOM
// ============================================
const authPage = document.getElementById("authPage");
const mainPage = document.getElementById("mainPage");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");
const userEmail = document.getElementById("userEmail");
const roleBadge = document.getElementById("roleBadge");
const logoutBtn = document.getElementById("logoutBtn");
const postContent = document.getElementById("postContent");
const postCategory = document.getElementById("postCategory");
const addPostBtn = document.getElementById("addPostBtn");
const postsList = document.getElementById("postsList");
const themeToggle = document.getElementById("themeToggle");
const adminPanelBtn = document.getElementById("adminPanelBtn");

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const menuToggle = document.getElementById("menuToggle");
const navItems = document.querySelectorAll(".nav-item");
const sidebarUserEmail = document.getElementById("sidebarUserEmail");
const currentCategoryIcon = document.getElementById("currentCategoryIcon");
const currentCategoryName = document.getElementById("currentCategoryName");

const roleSelectorWrapper = document.getElementById("roleSelectorWrapper");
const signupRole = document.getElementById("signupRole");
const roleHint = document.getElementById("roleHint");

const editModal = document.getElementById("editModal");
const editPostContent = document.getElementById("editPostContent");
const editPostCategory = document.getElementById("editPostCategory");
const saveEditBtn = document.getElementById("saveEditBtn");
const adminModal = document.getElementById("adminModal");
const maxAdminsInput = document.getElementById("maxAdminsInput");
const saveMaxAdminsBtn = document.getElementById("saveMaxAdminsBtn");
const currentAdminCountEl = document.getElementById("currentAdminCount");
const maxAdminsDisplay = document.getElementById("maxAdminsDisplay");
const adminSettingsMsg = document.getElementById("adminSettingsMsg");
const usersList = document.getElementById("usersList");

// ============================================
// أدوات مساعدة
// ============================================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function isAdmin() { return currentUserData?.role === "admin"; }

function translateError(code) {
  const map = {
    "auth/invalid-email": "البريد الإلكتروني غير صحيح",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد",
    "auth/wrong-password": "كلمة المرور غير صحيحة",
    "auth/invalid-credential": "بيانات الدخول غير صحيحة",
    "auth/email-already-in-use": "البريد الإلكتروني مستخدم مسبقاً",
    "auth/weak-password": "كلمة المرور ضعيفة (6 أحرف على الأقل)",
    "permission-denied": "ليس لديك صلاحية (راجع قواعد Firestore)",
    "unavailable": "تعذّر الاتصال بالخادم، تحقق من الإنترنت"
  };
  return map[code] || "حدث خطأ، حاول مرة أخرى";
}

function playTitleAnimation(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.classList.remove("animate-in");
  void el.offsetWidth;
  el.classList.add("animate-in");
}

// ============================================
// إغلاق النوافذ المنبثقة
// ============================================
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    const modalId = btn.dataset.close;
    document.getElementById(modalId).classList.add("hidden");
    if (modalId === "editModal") editingPostId = null;
  });
});

// ============================================
// التبويبات
// ============================================
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    loginForm.classList.toggle("hidden", target !== "login");
    signupForm.classList.toggle("hidden", target !== "signup");
    loginError.textContent = "";
    signupError.textContent = "";
  });
});

// ============================================
// تحميل توفّر مقعد مشرف
// ============================================
async function loadSignupAvailability() {
  try {
    console.log("🔍 التحقق من توفّر مقعد مشرف...");
    const settingsRef = doc(db, "settings", "config");
    const snap = await getDoc(settingsRef);

    let maxAdmins = 1;
    let currentAdminCount = 0;

    if (snap.exists()) {
      maxAdmins = snap.data().maxAdmins ?? 1;
      currentAdminCount = snap.data().currentAdminCount ?? 0;
      console.log("📊 الإعدادات:", { maxAdmins, currentAdminCount });
    } else {
      console.log("ℹ️ لا توجد إعدادات بعد، الافتراضي: 1 مشرف");
    }

    const canSignupAsAdmin = currentAdminCount < maxAdmins;
    roleSelectorWrapper.classList.toggle("hidden", !canSignupAsAdmin);

    if (canSignupAsAdmin) {
      const remaining = maxAdmins - currentAdminCount;
      roleHint.textContent = `يوجد ${remaining} مقعد مشرف متاح`;
      console.log("✅ القائمة ظاهرة - متاح:", remaining);
    } else {
      console.log("🚫 لا توجد مقاعد مشرف متاحة");
    }
  } catch (err) {
    console.error("❌ خطأ في تحميل الإعدادات:", err);
    roleSelectorWrapper.classList.add("hidden");
  }
}

// ============================================
// تسجيل الدخول
// ============================================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginError.style.color = "#e53935";

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  console.log("🔐 محاولة تسجيل الدخول:", email);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("✅ تم تسجيل الدخول");
    loginForm.reset();
  } catch (err) {
    console.error("❌ خطأ في الدخول:", err.code, err.message);
    loginError.textContent = translateError(err.code) + " (" + err.code + ")";
  }
});

// ============================================
// إنشاء حساب جديد
// ============================================
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  signupError.textContent = "";
  signupError.style.color = "#e53935";

  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  const wrapperVisible = !roleSelectorWrapper.classList.contains("hidden");
  pendingSignupRole = (wrapperVisible && signupRole)
    ? (signupRole.value || "user")
    : "user";

  console.log("📝 محاولة تسجيل حساب جديد:", email, "| الدور:", pendingSignupRole);

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log("✅ تم إنشاء حساب Auth بنجاح:", cred.user.uid);
    signupForm.reset();
  } catch (err) {
    console.error("❌ خطأ في إنشاء الحساب:", err.code, err.message);
    signupError.textContent = translateError(err.code) + " (" + err.code + ")";
    pendingSignupRole = null;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

// ============================================
// مراقبة حالة الدخول
// ============================================
onAuthStateChanged(auth, async (user) => {
  if (unsubscribePosts) { unsubscribePosts(); unsubscribePosts = null; }
  if (unsubscribeUserDoc) { unsubscribeUserDoc(); unsubscribeUserDoc = null; }

  if (user) {
    console.log("✅ تم تسجيل الدخول:", user.email);

    currentUser = user;
    authPage.classList.add("hidden");
    mainPage.classList.remove("hidden");

    try {
      await ensureUserDoc(user);
      console.log("✅ تم تجهيز وثيقة المستخدم");

      listenToUserDoc(user.uid);
      listenToPosts();
      console.log("✅ تم تحميل المراقبات");
    } catch (err) {
      console.error("❌ خطأ في تجهيز الحساب:", err);
      alert(
        "حدث خطأ في تجهيز حسابك:\n" +
        "الكود: " + (err.code || "غير معروف") + "\n" +
        "الرسالة: " + err.message + "\n\n" +
        "افتح Console (F12) لمزيد من التفاصيل."
      );
    }

    setTimeout(() => playTitleAnimation(".site-title"), 100);
  } else {
    console.log("🚪 تم تسجيل الخروج");

    currentUser = null;
    currentUserData = null;
    postsCache = {};
    currentCategory = "all";
    editingPostId = null;
    pendingSignupRole = null;

    authPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
    postsList.innerHTML = "";

    navItems.forEach(i => i.classList.toggle("active", i.dataset.category === "all"));
    updateCategoryBanner();
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");

    setTimeout(() => playTitleAnimation(".site-title-auth"), 100);
    await loadSignupAvailability();
  }
});

// ============================================
// وثيقة المستخدم
// ============================================
async function ensureUserDoc(user) {
  const userRef = doc(db, "users", user.uid);
  console.log("🔍 التحقق من وجود وثيقة المستخدم...");

  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    console.log("ℹ️ وثيقة المستخدم موجودة مسبقاً");
    pendingSignupRole = null;
    return;
  }

  console.log("🆕 إنشاء وثيقة مستخدم جديدة...");

  const settingsRef = doc(db, "settings", "config");
  let settingsSnap = await getDoc(settingsRef);
  let maxAdmins = 1;
  let currentAdminCount = 0;

  if (settingsSnap.exists()) {
    maxAdmins = settingsSnap.data().maxAdmins ?? 1;
    currentAdminCount = settingsSnap.data().currentAdminCount ?? 0;
    console.log("📊 الإعدادات الحالية:", { maxAdmins, currentAdminCount });
  } else {
    console.log("🆕 لا توجد إعدادات، إنشاء إعدادات افتراضية...");
    try {
      await setDoc(settingsRef, { maxAdmins: 1, currentAdminCount: 0 });
      console.log("✅ تم إنشاء الإعدادات");
    } catch (e) {
      console.warn("⚠️ تعذّر إنشاء الإعدادات:", e);
      settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        maxAdmins = settingsSnap.data().maxAdmins ?? 1;
        currentAdminCount = settingsSnap.data().currentAdminCount ?? 0;
      }
    }
  }

  let chosenRole = pendingSignupRole || "user";
  if (chosenRole === "admin" && currentAdminCount >= maxAdmins) {
    console.log("⚠️ تم تحويل الدور من مشرف إلى مستخدم (لا توجد مقاعد)");
    chosenRole = "user";
  }

  console.log("👤 الدور النهائي:", chosenRole);

  await setDoc(userRef, {
    email: user.email,
    role: chosenRole,
    createdAt: serverTimestamp()
  });
  console.log("✅ تم إنشاء وثيقة المستخدم");

  if (chosenRole === "admin") {
    try {
      await updateDoc(settingsRef, { currentAdminCount: currentAdminCount + 1 });
      console.log("✅ تم تحديث عدّاد المشرفين إلى:", currentAdminCount + 1);
    } catch (e) {
      console.warn("⚠️ تعذّر تحديث عدّاد المشرفين:", e);
    }
  }

  pendingSignupRole = null;
}

function listenToUserDoc(uid) {
  const userRef = doc(db, "users", uid);
  unsubscribeUserDoc = onSnapshot(userRef, (snap) => {
    if (!snap.exists()) return;
    currentUserData = snap.data();
    renderUserInfo();
  });
}

function renderUserInfo() {
  if (!currentUser || !currentUserData) return;
  userEmail.textContent = currentUser.email;
  sidebarUserEmail.textContent = currentUser.email;

  const admin = isAdmin();
  roleBadge.textContent = admin ? "👑 مشرف" : "مستخدم";
  roleBadge.className = "role-badge " + (admin ? "admin" : "user");
  adminPanelBtn.classList.toggle("hidden", !admin);
}

// ============================================
// المنشورات
// ============================================
function listenToPosts() {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  unsubscribePosts = onSnapshot(q, (snapshot) => {
    postsCache = {};
    snapshot.forEach((docSnap) => {
      postsCache[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
    });
    renderFilteredPosts();
  }, (err) => {
    console.error("❌ خطأ في تحميل المنشورات:", err);
  });
}

function renderFilteredPosts() {
  const uid = currentUser?.uid;
  postsList.innerHTML = "";

  const allPosts = Object.values(postsCache).sort((a, b) => {
    const da = a.createdAt?.toDate?.() || 0;
    const db_ = b.createdAt?.toDate?.() || 0;
    return db_ - da;
  });

  const filtered = currentCategory === "all"
    ? allPosts
    : allPosts.filter(p => p.category === currentCategory);

  if (filtered.length === 0) {
    postsList.innerHTML = `<div class="empty-state">
      لا توجد منشورات في هذا القسم بعد. كن أول من ينشر! ✨
    </div>`;
    return;
  }

  filtered.forEach(post => postsList.appendChild(buildPostElement(post, uid)));
}

function buildPostElement(post, currentUid) {
  const wrapper = document.createElement("div");
  wrapper.className = "post";
  wrapper.dataset.postId = post.id;

  const date = post.createdAt?.toDate
    ? post.createdAt.toDate().toLocaleString("ar-EG")
    : "الآن";

  const cat = CATEGORIES[post.category] || { name: "غير مصنّف", icon: "📌" };
  const isOwner = post.userId === currentUid;
  const admin = isAdmin();
  const canEdit = isOwner;
  const canDelete = isOwner || admin;

  wrapper.innerHTML = `
    <div class="post-header">
      <span>👤 ${escapeHtml(post.authorEmail || "مستخدم")}</span>
      <span>${date}</span>
    </div>
    <div class="post-category-tag">${cat.icon} ${cat.name}</div>
    <div class="post-content">${escapeHtml(post.content)}</div>
    <div class="post-actions">
      <button class="btn-action btn-like" data-id="${post.id}">
        ❤️ <span class="likes-count">0</span>
      </button>
      <button class="btn-action btn-comment" data-id="${post.id}">
        💬 <span class="comments-count">0</span>
      </button>
      ${canEdit ? `<button class="btn-edit" data-id="${post.id}">✏️ تعديل</button>` : ""}
      ${canDelete ? `<button class="btn-delete" data-id="${post.id}">🗑️ حذف</button>` : ""}
    </div>
    <div class="comments-section" data-comments-for="${post.id}">
      <div class="comments-list"></div>
      <div class="comment-input-row">
        <input type="text" class="comment-input" placeholder="أضف تعليقاً..." maxlength="300" />
        <button class="btn-primary btn-send-comment" data-id="${post.id}">إرسال</button>
      </div>
    </div>
  `;

  wrapper.querySelector(".btn-like").addEventListener("click", () => toggleLike(post.id));
  wrapper.querySelector(".btn-comment").addEventListener("click", () => {
    wrapper.querySelector(".comments-section").classList.toggle("open");
  });

  const editBtn = wrapper.querySelector(".btn-edit");
  if (editBtn) editBtn.addEventListener("click", () => openEditModal(post.id));

  const deleteBtn = wrapper.querySelector(".btn-delete");
  if (deleteBtn) deleteBtn.addEventListener("click", () => deletePost(post.id));

  wrapper.querySelector(".btn-send-comment").addEventListener("click", () => {
    const input = wrapper.querySelector(".comment-input");
    addComment(post.id, input.value, input);
  });

  listenToLikes(post.id, wrapper);
  listenToComments(post.id, wrapper);

  return wrapper;
}

// ============================================
// الإعجابات
// ============================================
function listenToLikes(postId, postElement) {
  const likesRef = collection(db, "posts", postId, "likes");
  onSnapshot(likesRef, (snap) => {
    const count = snap.size;
    const likedByMe = currentUser && snap.docs.some(d => d.id === currentUser.uid);

    const btn = postElement.querySelector(".btn-like");
    const countSpan = postElement.querySelector(".likes-count");
    if (btn) {
      countSpan.textContent = count;
      btn.classList.toggle("liked", likedByMe);
    }
  }, (err) => {
    console.error("❌ خطأ في تحميل الإعجابات:", err);
  });
}

async function toggleLike(postId) {
  if (!currentUser) return;
  const likeRef = doc(db, "posts", postId, "likes", currentUser.uid);
  const snap = await getDoc(likeRef);
  if (snap.exists()) {
    await deleteDoc(likeRef);
  } else {
    await setDoc(likeRef, { createdAt: serverTimestamp() });
  }
}

// ============================================
// التعليقات
// ============================================
function listenToComments(postId, postElement) {
  const commentsRef = collection(db, "posts", postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  onSnapshot(q, (snap) => {
    const container = postElement.querySelector(".comments-list");
    const countSpan = postElement.querySelector(".comments-count");
    if (!container) return;

    countSpan.textContent = snap.size;
    container.innerHTML = "";

    if (snap.empty) {
      container.innerHTML = `<p class="no-comments">لا توجد تعليقات بعد</p>`;
      return;
    }

    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const canDelete = currentUser && (c.userId === currentUser.uid || isAdmin());
      const cDate = c.createdAt?.toDate
        ? c.createdAt.toDate().toLocaleString("ar-EG")
        : "الآن";

      const commentEl = document.createElement("div");
      commentEl.className = "comment";
      commentEl.innerHTML = `
        <div class="comment-header">
          <span>👤 ${escapeHtml(c.authorEmail || "مستخدم")}</span>
          <span>${cDate}</span>
        </div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
        ${canDelete ? `<button class="comment-delete" data-cid="${docSnap.id}" data-pid="${postId}">🗑️</button>` : ""}
      `;

      const delBtn = commentEl.querySelector(".comment-delete");
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          deleteDoc(doc(db, "posts", postId, "comments", docSnap.id));
        });
      }

      container.appendChild(commentEl);
    });
  }, (err) => {
    console.error("❌ خطأ في تحميل التعليقات:", err);
  });
}

async function addComment(postId, text, inputEl) {
  if (!currentUser) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    await addDoc(collection(db, "posts", postId, "comments"), {
      userId: currentUser.uid,
      authorEmail: currentUser.email,
      text: trimmed,
      createdAt: serverTimestamp()
    });
    inputEl.value = "";
  } catch (err) {
    alert("خطأ في إضافة التعليق: " + err.message);
  }
}

// ============================================
// إضافة منشور
// ============================================
addPostBtn.addEventListener("click", async () => {
  const content = postContent.value.trim();
  if (!content) return alert("اكتب شيئاً أولاً!");
  if (!currentUser) return;

  addPostBtn.disabled = true;
  addPostBtn.textContent = "جاري النشر...";

  try {
    await addDoc(collection(db, "posts"), {
      content,
      category: postCategory.value,
      userId: currentUser.uid,
      authorEmail: currentUser.email,
      createdAt: serverTimestamp()
    });
    postContent.value = "";

    if (currentCategory !== "all" && currentCategory !== postCategory.value) {
      currentCategory = postCategory.value;
      navItems.forEach(i => {
        i.classList.toggle("active", i.dataset.category === currentCategory);
      });
      updateCategoryBanner();
    }
  } catch (err) {
    alert("خطأ في النشر: " + err.message);
  } finally {
    addPostBtn.disabled = false;
    addPostBtn.textContent = "نشر";
  }
});

// ============================================
// تعديل منشور
// ============================================
function openEditModal(postId) {
  const post = postsCache[postId];
  if (!post) return;
  if (post.userId !== currentUser.uid) {
    return alert("يمكنك تعديل منشوراتك فقط");
  }

  editingPostId = postId;
  editPostContent.value = post.content;
  editPostCategory.value = post.category || "quran";
  editModal.classList.remove("hidden");
}

saveEditBtn.addEventListener("click", async () => {
  if (!editingPostId) return;
  const newContent = editPostContent.value.trim();
  if (!newContent) return alert("المحتوى فارغ");

  try {
    await updateDoc(doc(db, "posts", editingPostId), {
      content: newContent,
      category: editPostCategory.value
    });
    editModal.classList.add("hidden");
    editingPostId = null;
  } catch (err) {
    alert("خطأ في التعديل: " + err.message);
  }
});

// ============================================
// حذف منشور
// ============================================
async function deletePost(postId) {
  const post = postsCache[postId];
  if (!post) return;

  const isOwner = post.userId === currentUser.uid;
  const admin = isAdmin();

  if (!isOwner && !admin) {
    return alert("غير مصرّح لك بحذف هذا المنشور");
  }

  const msg = isOwner ? "هل تريد حذف منشورك؟" : "هل تريد حذف هذا المنشور كمشرف؟";
  if (!confirm(msg)) return;

  try {
    await deleteDoc(doc(db, "posts", postId));
  } catch (err) {
    alert("خطأ في الحذف: " + err.message);
  }
}

// ============================================
// لوحة التحكم
// ============================================
adminPanelBtn.addEventListener("click", async () => {
  if (!isAdmin()) return;
  adminModal.classList.remove("hidden");
  await loadAdminPanel();
});

async function loadAdminPanel() {
  const settingsRef = doc(db, "settings", "config");

  const usersSnap = await getDocs(collection(db, "users"));
  const users = [];
  usersSnap.forEach(d => users.push({ uid: d.id, ...d.data() }));

  users.sort((a, b) => {
    const aScore = a.role === "admin" ? 0 : 1;
    const bScore = b.role === "admin" ? 0 : 1;
    return aScore - bScore;
  });

  const actualAdminCount = users.filter(u => u.role === "admin").length;

  let settingsSnap = await getDoc(settingsRef);
  let maxAdmins = 1;
  let storedCount = 0;

  if (settingsSnap.exists()) {
    maxAdmins = settingsSnap.data().maxAdmins ?? 1;
    storedCount = settingsSnap.data().currentAdminCount ?? 0;
  } else if (isAdmin()) {
    await setDoc(settingsRef, { maxAdmins: 1, currentAdminCount: actualAdminCount });
    storedCount = actualAdminCount;
  }

  if (isAdmin() && storedCount !== actualAdminCount) {
    try {
      await updateDoc(settingsRef, { currentAdminCount: actualAdminCount });
      storedCount = actualAdminCount;
    } catch (e) {
      console.warn("تعذّر مزامنة العدّاد:", e);
    }
  }

  maxAdminsInput.value = maxAdmins;
  maxAdminsDisplay.textContent = maxAdmins;
  currentAdminCountEl.textContent = actualAdminCount;

  renderUsersList(users, actualAdminCount, maxAdmins);
}

function renderUsersList(users, adminCount, maxAdmins) {
  usersList.innerHTML = "";

  users.forEach(u => {
    const row = document.createElement("div");
    row.className = "user-row" + (u.role === "admin" ? " is-admin" : "");

    const isMe = u.uid === currentUser.uid;
    const isUserAdmin = u.role === "admin";

    let actionBtn = "";
    if (isUserAdmin) {
      const canDemote = !(isMe && adminCount <= 1);
      actionBtn = `<button class="btn-sm demote" data-uid="${u.uid}" data-action="demote" ${canDemote ? "" : "disabled"}>تخفيض</button>`;
    } else {
      const canPromote = adminCount < maxAdmins;
      actionBtn = `<button class="btn-sm promote" data-uid="${u.uid}" data-action="promote" ${canPromote ? "" : "disabled"}>ترقية لمشرف</button>`;
    }

    row.innerHTML = `
      <div class="user-row-email">
        ${isUserAdmin ? "👑" : "👤"} ${escapeHtml(u.email)}
        ${isMe ? "<small style='color:var(--text-muted)'>(أنت)</small>" : ""}
      </div>
      <div class="user-row-actions">
        ${actionBtn}
      </div>
    `;

    usersList.appendChild(row);
  });

  usersList.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => changeUserRole(btn.dataset.uid, btn.dataset.action));
  });
}

async function changeUserRole(uid, action) {
  try {
    const userRef = doc(db, "users", uid);
    const settingsRef = doc(db, "settings", "config");

    const userDoc = await getDoc(userRef);
    const settingsDoc = await getDoc(settingsRef);
    if (!userDoc.exists()) return;

    const oldRole = userDoc.data().role;
    const newRole = action === "promote" ? "admin" : "user";
    if (oldRole === newRole) return;

    const settings = settingsDoc.exists()
      ? settingsDoc.data()
      : { maxAdmins: 1, currentAdminCount: 0 };

    let newCount = settings.currentAdminCount ?? 0;
    if (newRole === "admin") newCount++;
    if (oldRole === "admin") newCount--;

    if (newRole === "admin" && newCount > settings.maxAdmins) {
      return alert("لا يمكن تجاوز الحد الأقصى للمشرفين");
    }

    await updateDoc(userRef, { role: newRole });
    await updateDoc(settingsRef, { currentAdminCount: newCount });

    await loadAdminPanel();
  } catch (err) {
    alert("خطأ: " + err.message);
  }
}

saveMaxAdminsBtn.addEventListener("click", async () => {
  if (!isAdmin()) return;
  adminSettingsMsg.textContent = "";

  const value = parseInt(maxAdminsInput.value, 10);
  if (isNaN(value) || value < 1) {
    adminSettingsMsg.style.color = "#e53935";
    adminSettingsMsg.textContent = "يجب أن تكون القيمة 1 على الأقل";
    return;
  }

  const actualCount = parseInt(currentAdminCountEl.textContent, 10) || 0;
  if (value < actualCount) {
    adminSettingsMsg.style.color = "#e53935";
    adminSettingsMsg.textContent = `لا يمكن أن يكون أقل من العدد الحالي (${actualCount})`;
    return;
  }

  try {
    await setDoc(doc(db, "settings", "config"), { maxAdmins: value }, { merge: true });
    adminSettingsMsg.style.color = "var(--green)";
    adminSettingsMsg.textContent = "✓ تم الحفظ بنجاح";
    await loadAdminPanel();
    setTimeout(() => { adminSettingsMsg.textContent = ""; }, 3000);
  } catch (err) {
    adminSettingsMsg.style.color = "#e53935";
    adminSettingsMsg.textContent = "خطأ: " + err.message;
  }
});

// ============================================
// القائمة الجانبية
// ============================================
menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("active");
});

sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
});

navItems.forEach(item => {
  item.addEventListener("click", () => {
    navItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    currentCategory = item.dataset.category;
    updateCategoryBanner();
    renderFilteredPosts();

    if (window.innerWidth <= 900) {
      sidebar.classList.remove("open");
      sidebarOverlay.classList.remove("active");
    }
  });
});

function updateCategoryBanner() {
  const cat = CATEGORIES[currentCategory];
  if (!cat) return;
  currentCategoryIcon.textContent = cat.icon;
  currentCategoryName.textContent = cat.name;
}

// ============================================
// الوضع الليلي
// ============================================
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
themeToggle.textContent = savedTheme === "dark" ? "☀️" : "🌙";

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", next);
});
