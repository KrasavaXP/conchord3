// --- ЧАСТЬ 1: ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И ИНИЦИАЛИЗАЦИЯ ---

document.addEventListener('DOMContentLoaded', () => {
    // --- Глобальные переменные ---
    let currentUser = null, currentServers = [], activeServer = null, activeTextChannel = null, lastActiveTextChannel = null, activeVoiceChannel = null, lastVoiceChannel = null;
    const socket = io({ autoConnect: false, transports: ['websocket'] });
    let localStream, localScreenStream, localVideoStream;
    const peerConnections = {};
    let isMuted = false, isDeafened = false;
    let audioContext, analyser, microphone, speakingAnimation;
    let settingsUnsavedChanges = false, serverSettingsUnsavedChanges = false;
    let createServerData = {};
    let tempServerSettings = {};
    let isVoiceFocusView = false;
    let currentVoiceUsers = {};

    // --- Элементы UI ---
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    const dragOverlay = document.getElementById('drag-overlay');
    const dragChannelName = document.getElementById('drag-channel-name');
    const modalContainer = document.getElementById('modal-container');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showLoginLink = document.getElementById('show-login');
    const showRegisterLink = document.getElementById('show-register');
    const registerMessage = document.getElementById('register-message');
    const loginMessage = document.getElementById('login-message');
    const homeBtn = document.getElementById('home-btn');
    const serversList = document.getElementById('servers-list');
    const addServerBtn = document.getElementById('add-server-btn');
    const exploreServersBtn = document.getElementById('explore-servers-btn');
    const serverHeader = document.getElementById('server-header');
    const serverNameHeader = document.getElementById('server-name-header');
    const serverOptionsDropdown = document.getElementById('server-options-dropdown');
    const channelsContainer = document.getElementById('channels-container');
    const voiceStatusPanel = document.getElementById('voice-status-panel');
    const voiceStatusChannelName = voiceStatusPanel.querySelector('.channel-name-status');
    const disconnectVoiceBtn = document.getElementById('disconnect-voice-btn');
    const panelUsername = document.getElementById('panel-username');
    const panelAvatar = document.getElementById('panel-avatar');
    const micBtn = document.getElementById('mic-btn');
    const deafenBtn = document.getElementById('deafen-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const channelHeader = document.getElementById('channel-header');
    const headerIcon = document.getElementById('header-icon');
    const channelNameHeader = document.getElementById('channel-name-header');
    const membersToggleBtn = document.getElementById('members-toggle-btn');
    const textChannelView = document.getElementById('text-channel-view');
    const voiceChannelView = document.getElementById('voice-channel-view');
    const voiceDisconnectedView = document.getElementById('voice-disconnected-view');
    const disconnectedChannelName = document.getElementById('disconnected-channel-name');
    const reconnectVoiceBtn = document.getElementById('reconnect-voice-btn');
    const placeholderView = document.getElementById('placeholder-view');
    const welcomeContent = document.getElementById('welcome-content');
    const exploreContent = document.getElementById('explore-content');
    const textMessagesList = document.getElementById('text-messages-list');
    const textChatForm = document.getElementById('text-chat-form');
    const textChatInput = document.getElementById('text-chat-input');
    const attachFileBtn = document.getElementById('attach-file-btn');
    const fileUploadInput = document.getElementById('file-upload-input');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPickerContainer = document.getElementById('emoji-picker-container');
    const emojiPicker = document.querySelector('emoji-picker');
    const videoGrid = document.getElementById('video-grid');
    const vcCameraBtn = document.getElementById('vc-camera-btn');
    const vcScreenBtn = document.getElementById('vc-screen-btn');
    const vcMicBtn = document.getElementById('vc-mic-btn');
    const vcLeaveBtn = document.getElementById('vc-leave-btn');
    const membersSidebar = document.getElementById('members-sidebar');
    const membersListContainer = document.getElementById('members-list-container');
    const joinSound = document.getElementById('join-sound');
    const leaveSound = document.getElementById('leave-sound');
    const notificationSound = document.getElementById('notification-sound');
    const createServerModalBackdrop = document.getElementById('create-server-modal-backdrop');
    const settingsModalBackdrop = document.getElementById('settings-modal-backdrop');
    const serverSettingsModalBackdrop = document.getElementById('server-settings-modal-backdrop');
    const createChannelModalBackdrop = document.getElementById('create-channel-modal-backdrop');
    const changePasswordModalBackdrop = document.getElementById('change-password-modal-backdrop');

    // --- ЛОГИКА АУТЕНТИФИКАЦИИ ---
    showLoginLink.addEventListener('click', (e) => { e.preventDefault(); registerView.classList.add('hidden'); loginView.classList.remove('hidden'); });
    showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); loginView.classList.add('hidden'); registerView.classList.remove('hidden'); });
    registerForm.addEventListener('submit', (e) => handleAuth(e, '/register', registerMessage));
    loginForm.addEventListener('submit', (e) => handleAuth(e, '/login', loginMessage));

    async function handleAuth(event, url, messageEl) {
        event.preventDefault();
        const form = event.target;
        const body = {};
        if (url === '/register') {
            body.login = form.querySelector('#reg-email').value;
            body.username = form.querySelector('#reg-username').value;
            body.password = form.querySelector('#reg-password').value;
        } else {
            body.login = form.querySelector('#login-email').value;
            body.password = form.querySelector('#login-password').value;
        }
        messageEl.textContent = '';
        try {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const result = await response.json();
            if (response.ok) {
                if (url === '/register') {
                    messageEl.textContent = result.message + " Теперь вы можете войти.";
                    messageEl.className = 'message success';
                    setTimeout(() => {
                        registerView.classList.add('hidden');
                        loginView.classList.remove('hidden');
                        form.reset();
                    }, 2000);
                } else {
                    localStorage.setItem('token', result.token);
                    initializeApp(result.user);
                }
            } else {
                messageEl.textContent = result.message;
                messageEl.className = 'message error';
            }
        } catch (err) {
            messageEl.textContent = 'Сетевая ошибка. Не удалось связаться с сервером.';
            messageEl.className = 'message error';
        }
    }

    // --- ПРОВЕРКА СЕССИИ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ---
    (async () => {
        const token = localStorage.getItem('token');
        if (token) {
            authScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            try {
                const response = await fetch('/profile', { headers: { 'Authorization': `Bearer ${token}` } });
                if (response.ok) {
                    const data = await response.json();
                    initializeApp(data.user);
                } else {
                    localStorage.removeItem('token');
                    authScreen.classList.remove('hidden');
                    mainApp.classList.add('hidden');
                }
            } catch (error) {
                localStorage.removeItem('token');
                authScreen.classList.remove('hidden');
                mainApp.classList.add('hidden');
            }
        } else {
            authScreen.classList.remove('hidden');
            mainApp.classList.add('hidden');
        }
    })();

    // --- ИНИЦИАЛИЗАЦИЯ И УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ ---
    function initializeApp(user) {
        currentUser = user;
        socket.auth = { token: localStorage.getItem('token') };
        socket.connect();
        authScreen.classList.add('hidden');
        mainApp.classList.remove('hidden');
        updateUserPanel(user);
        loadUserServers();
        setupSocketListeners();
        setupDragAndDrop();
        setupGlobalEventListeners();
        resetToHome();
    }
// --- ЧАСТЬ 2: УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ И РЕНДЕРИНГ ---

    function updateUserPanel(user) {
        panelUsername.textContent = user.username;
        updateAvatarDisplay(panelAvatar, user.avatar, user.username);
    }

    function resetToHome() {
        activeServer = null;
        activeTextChannel = null;
        lastActiveTextChannel = null;
        if (activeVoiceChannel) leaveVoiceChannel();

        document.body.classList.add('no-members');
        document.querySelectorAll('.servers-column .server-icon').forEach(icon => icon.classList.remove('active'));
        homeBtn.classList.add('active');
        
        serverNameHeader.textContent = 'Главная';
        channelsContainer.innerHTML = '';
        serverOptionsDropdown.classList.add('hidden');
        membersSidebar.classList.add('hidden');

        setActiveChannelView('placeholder-welcome');
    }

    async function loadUserServers() {
        try {
            const response = await fetch('/servers', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (response.ok) {
                currentServers = await response.json();
                renderServers();
            } else { console.error('Не удалось загрузить серверы'); }
        } catch (err) { console.error('Сетевая ошибка при загрузке серверов:', err); }
    }

    function renderServers() {
        serversList.innerHTML = '';
        currentServers.forEach(server => {
            const serverIconWrapper = document.createElement('div');
            serverIconWrapper.className = 'server-icon';
            serverIconWrapper.dataset.serverId = server.id;
            serverIconWrapper.title = server.name;
            
            const pill = document.createElement('div');
            pill.className = 'pill';
            
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            updateAvatarDisplay(avatar, server.avatar, server.name);

            serverIconWrapper.appendChild(pill);
            serverIconWrapper.appendChild(avatar);

            serverIconWrapper.addEventListener('click', () => selectServer(server.id));
            serversList.appendChild(serverIconWrapper);
        });
    }

    async function selectServer(serverId) {
        if (activeServer && activeServer.id === serverId) return;
        
        const serverData = await fetchServerData(serverId);
        if (!serverData) return;

        if (activeVoiceChannel) leaveVoiceChannel();

        activeServer = serverData;
        activeTextChannel = null;
        lastActiveTextChannel = null;
        
        document.body.classList.remove('no-members');
        document.querySelectorAll('.servers-column .server-icon').forEach(icon => {
            icon.classList.toggle('active', icon.dataset.serverId === serverId.toString());
        });
        homeBtn.classList.remove('active');
        
        serverNameHeader.textContent = serverData.name;
        serverOptionsDropdown.classList.remove('hidden');
        
        renderChannels(serverData.channels);
        renderMembersList();
        
        setActiveChannelView('placeholder', { title: `Добро пожаловать на ${serverData.name}!`, text: 'Выберите канал, чтобы начать общение.' });
    }

    async function fetchServerData(serverId) {
        try {
            const response = await fetch(`/servers/${serverId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (response.ok) {
                return await response.json();
            } else {
                console.error('Не удалось загрузить данные сервера');
                alert('Не удалось загрузить данные сервера. Возможно, у вас нет к нему доступа.');
                return null;
            }
        } catch (err) {
            console.error('Сетевая ошибка при загрузке данных сервера:', err);
            return null;
        }
    }

    function renderChannels(channels) {
        channelsContainer.innerHTML = '';
        ['text', 'voice'].forEach(type => {
            const categoryName = type === 'text' ? 'Текстовые каналы' : 'Голосовые каналы';
            const category = document.createElement('div');
            category.className = 'channel-category';
            category.innerHTML = `<span>${categoryName}</span> <i class="fa-solid fa-plus channel-add-btn" data-type="${type}" title="Создать канал"></i>`;
            channelsContainer.appendChild(category);

            if (channels[type] && channels[type].length > 0) {
                channels[type].forEach(channel => {
                    const channelEl = document.createElement('div');
                    channelEl.className = 'channel';
                    channelEl.dataset.channelId = channel.id;
                    channelEl.dataset.channelType = type;
                    const icon = channel.private ? 'fa-lock' : (type === 'text' ? 'fa-hashtag' : 'fa-volume-high');
                    channelEl.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${channel.name}</span>`;
                    channelEl.addEventListener('click', () => selectChannel({ ...channel, type }));
                    channelsContainer.appendChild(channelEl);
                    
                    if (type === 'voice') {
                        const membersContainer = document.createElement('div');
                        membersContainer.className = 'voice-channel-members';
                        membersContainer.id = `members-${channel.id}`;
                        channelsContainer.appendChild(membersContainer);
                    }
                });
            }
        });
        updateAllVoiceChannelMembers();
    }

    async function selectChannel(channel) {
        if (channel.type === 'text') {
            if (activeTextChannel && activeTextChannel.id === channel.id) return;
            
            isVoiceFocusView = false;
            setActiveChannelView('text', channel);
            socket.emit('join-channel', { serverId: activeServer.id, channelId: channel.id, channelType: 'text' });
        } 
        else if (channel.type === 'voice') {
            if (activeVoiceChannel && activeVoiceChannel.id === channel.id) {
                isVoiceFocusView = true;
                setActiveChannelView('voice', channel);
                updateVideoGridLayout();
            } 
            else {
                await joinVoiceChannel(channel);
                if (activeTextChannel) {
                    setActiveChannelView('text', activeTextChannel);
                } else {
                    setActiveChannelView('placeholder', { title: `Добро пожаловать на ${activeServer.name}!`, text: 'Выберите канал, чтобы начать общение.' });
                }
            }
        }
    }

    function setActiveChannelView(viewType, data = {}) {
        [textChannelView, voiceChannelView, voiceDisconnectedView, placeholderView].forEach(v => v.classList.add('hidden'));
        [welcomeContent, exploreContent].forEach(c => c.classList.add('hidden'));
        
        document.querySelectorAll('.channels-list .channel.active').forEach(c => c.classList.remove('active'));

        if (viewType === 'text') {
            activeTextChannel = data;
            lastActiveTextChannel = data;
            textChannelView.classList.remove('hidden');
            headerIcon.className = data.private ? 'fa-solid fa-lock' : 'fa-solid fa-hashtag';
            channelNameHeader.textContent = data.name;
            textChatInput.placeholder = `Написать в #${data.name}`;
            const el = document.querySelector(`.channel[data-channel-id="${data.id}"]`);
            if (el) el.classList.add('active');
        } else if (viewType === 'voice') {
            voiceChannelView.classList.remove('hidden');
            headerIcon.className = 'fa-solid fa-volume-high';
            channelNameHeader.textContent = data.name;
        } else if (viewType === 'disconnected') {
            voiceDisconnectedView.classList.remove('hidden');
            disconnectedChannelName.textContent = data.name;
        } else if (viewType === 'placeholder' || viewType === 'placeholder-welcome') {
            placeholderView.classList.remove('hidden');
            welcomeContent.classList.remove('hidden');
            if (viewType === 'placeholder') {
                welcomeContent.querySelector('#placeholder-title').textContent = data.title;
                welcomeContent.querySelector('#placeholder-text').textContent = data.text;
            } else {
                welcomeContent.querySelector('#placeholder-title').textContent = 'Добро пожаловать!';
                welcomeContent.querySelector('#placeholder-text').textContent = 'Выберите сервер или друга в списке слева.';
            }
            headerIcon.className = 'fa-solid fa-hashtag';
            channelNameHeader.textContent = '';
        } else if (viewType === 'explore') {
            placeholderView.classList.remove('hidden');
            exploreContent.classList.remove('hidden');
            headerIcon.className = 'fa-solid fa-compass';
            channelNameHeader.textContent = 'Путешествия';
        }
    }

    function renderMembersList() {
        if (!activeServer) {
            membersListContainer.innerHTML = '';
            return;
        }
        const roles = [...activeServer.roles].sort((a, b) => (b.position || 0) - (a.position || 0));
        let html = '';
        const displayedUserIds = new Set();

        roles.forEach(role => {
            const membersWithRole = activeServer.members.filter(m => m.roles.includes(role.id) && !displayedUserIds.has(m.userId));
            if (membersWithRole.length > 0) {
                html += `<div class="member-group-header">${role.name} — ${membersWithRole.length}</div>`;
                membersWithRole.forEach(member => {
                    const userData = activeServer.users[member.userId];
                    if (userData) {
                        html += `
                            <div class="member-item" data-user-id="${member.userId}">
                                <div class="avatar"></div>
                                <div class="username-wrapper">
                                    <span class="username">${userData.username}</span>
                                </div>
                            </div>`;
                        displayedUserIds.add(member.userId);
                    }
                });
            }
        });
        membersListContainer.innerHTML = html;
        document.querySelectorAll('#members-list-container .member-item').forEach(item => {
            const userId = item.dataset.userId;
            const userData = activeServer.users[userId];
            if (userData) {
                updateAvatarDisplay(item.querySelector('.avatar'), userData.avatar, userData.username);
            }
        });
    }
// --- ЧАСТЬ 3: ТЕКСТОВЫЙ ЧАТ, СООБЩЕНИЯ И НОВЫЙ ФУНКЦИОНАЛ ---

    function updateAvatarDisplay(element, avatarUrl, fallbackText = 'U') {
        if (avatarUrl) {
            element.style.backgroundImage = `url('${avatarUrl}')`;
            element.textContent = '';
            element.classList.add('has-image');
        } else {
            element.style.backgroundImage = 'none';
            const initials = fallbackText.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            element.textContent = initials;
            element.classList.remove('has-image');
        }
    }

    async function handleFileUpload(file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData
            });
            if (response.ok) {
                return await response.json();
            } else {
                console.error('Ошибка загрузки файла');
                alert('Ошибка загрузки файла. Проверьте консоль для деталей.');
                return null;
            }
        } catch (error) {
            console.error('Сетевая ошибка при загрузке файла', error);
            return null;
        }
    }

    function setupDragAndDrop() {
        // ИСПРАВЛЕНИЕ: Предотвращаем открытие файла в новой вкладке
        mainApp.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeTextChannel) {
                dragChannelName.textContent = `#${activeTextChannel.name}`;
                dragOverlay.classList.remove('hidden');
            }
        });

        mainApp.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        dragOverlay.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragOverlay.classList.add('hidden');
        });

        dragOverlay.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragOverlay.classList.add('hidden');
            if (e.dataTransfer.files.length > 0 && activeTextChannel) {
                for (const file of e.dataTransfer.files) {
                    const uploadResult = await handleFileUpload(file);
                    if (uploadResult) {
                        sendMessage(null, activeTextChannel, uploadResult.filePath);
                    }
                }
            }
        });
    }

    function sendMessage(inputElement, channel, attachment = null) {
        const message = inputElement ? inputElement.value.trim() : '';
        if ((message || attachment) && channel && activeServer) {
            socket.emit('chat-message', { 
                serverId: activeServer.id, 
                channelId: channel.id, 
                message,
                attachment
            });
            if (inputElement) inputElement.value = '';
        }
    }

    function renderMessage(data, prepend = false) {
        const { id, user, message, timestamp, attachment, edited, editedTimestamp, deleted, type } = data;
        
        if (type === 'system') {
            renderSystemMessage(data, prepend);
            return;
        }

        const isScrolledToBottom = textMessagesList.scrollHeight - textMessagesList.clientHeight <= textMessagesList.scrollTop + 5;

        let messageEl = textMessagesList.querySelector(`.message-group[data-message-id="${id}"]`);
        const messageExists = !!messageEl;

        if (!messageExists) {
            messageEl = document.createElement('div');
            messageEl.className = 'message-group';
            messageEl.dataset.messageId = id;
        }
        
        messageEl.dataset.userId = user.id;

        let attachmentHtml = '';
        if (attachment && !deleted) {
            const fileType = attachment.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
                attachmentHtml = `<div class="message-attachment"><img src="${attachment}" alt="Прикрепленное изображение" loading="lazy"></div>`;
            } else if (['mp4', 'webm', 'mov'].includes(fileType)) {
                attachmentHtml = `<div class="message-attachment"><video src="${attachment}" controls></video></div>`;
            } else {
                const fileName = attachment.split('/').pop();
                attachmentHtml = `<div class="message-attachment file"><a href="${attachment}" target="_blank" download><i class="fa-solid fa-file-arrow-down"></i> ${fileName}</a></div>`;
            }
        }

        const editedTag = edited ? `<span class="edited-tag" title="${new Date(editedTimestamp).toLocaleString()}">(ред.)</span>` : '';
        const messageContent = deleted 
            ? '<span class="deleted-text">Это сообщение было удалено.</span>'
            : message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const messageHtml = `
            <div class="avatar"></div>
            <div class="message-body">
                <div class="message-header">
                    <span class="username">${user.username}</span>
                    <span class="timestamp">${new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="message-content">${messageContent} ${editedTag}</div>
                ${attachmentHtml}
            </div>
            ${user.id === currentUser.id && !deleted ? `
            <div class="message-actions">
                <button class="edit-btn" title="Редактировать"><i class="fa-solid fa-pencil"></i></button>
                <button class="delete-btn" title="Удалить"><i class="fa-solid fa-trash"></i></button>
            </div>` : ''}
        `;

        if (!messageEl.querySelector('.message-edit-container')) {
            messageEl.innerHTML = messageHtml;
        }
        
        updateAvatarDisplay(messageEl.querySelector('.avatar'), user.avatar, user.username);
        
        if (!messageExists) {
            if (prepend) {
                textMessagesList.prepend(messageEl);
            } else {
                textMessagesList.appendChild(messageEl);
            }
        }

        if (isScrolledToBottom && !prepend) {
            textMessagesList.scrollTop = textMessagesList.scrollHeight;
        }
    }

    function renderSystemMessage(data, prepend = false) {
        const { message } = data;
        const messageEl = document.createElement('div');
        messageEl.className = 'system-message';
        const formattedMessage = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        messageEl.innerHTML = `<div class="icon"><i class="fa-solid fa-arrow-right-to-bracket"></i></div><div class="message-text">${formattedMessage}</div>`;
        if (prepend) {
            textMessagesList.prepend(messageEl);
        } else {
            textMessagesList.appendChild(messageEl);
        }
    }

    function showEditUI(messageEl) {
        const otherOpenEdits = document.querySelectorAll('.message-edit-container');
        otherOpenEdits.forEach(container => {
            const messageGroup = container.closest('.message-group');
            if (messageGroup) {
                const contentEl = messageGroup.querySelector('.message-content');
                if (contentEl) contentEl.style.display = 'block';
                container.remove();
            }
        });

        const contentEl = messageEl.querySelector('.message-content');
        const originalText = contentEl.childNodes[0].textContent;
        
        contentEl.style.display = 'none';

        const editContainer = document.createElement('div');
        editContainer.className = 'message-edit-container';
        editContainer.innerHTML = `
            <textarea class="message-edit-input">${originalText}</textarea>
            <div class="message-edit-footer">
                esc для <span class="cancel-edit">отмены</span> • enter чтобы <span class="save-edit">сохранить</span>
            </div>
        `;
        messageEl.querySelector('.message-body').appendChild(editContainer);

        const textarea = editContainer.querySelector('textarea');
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        });

        const messageId = messageEl.dataset.messageId;

        const saveChanges = () => {
            const newText = textarea.value.trim();
            if (newText && newText !== originalText) {
                socket.emit('edit-message', { serverId: activeServer.id, channelId: activeTextChannel.id, messageId: messageId, newMessage: newText });
            }
            contentEl.style.display = 'block';
            editContainer.remove();
        };

        const cancelEdit = () => {
            contentEl.style.display = 'block';
            editContainer.remove();
        };

        editContainer.querySelector('.save-edit').addEventListener('click', saveChanges);
        editContainer.querySelector('.cancel-edit').addEventListener('click', cancelEdit);

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveChanges();
            }
            if (e.key === 'Escape') {
                cancelEdit();
            }
        });
    }

    function showDeleteConfirmation(messageEl) {
        const messageId = messageEl.dataset.messageId;
        const messageClone = messageEl.cloneNode(true);
        messageClone.querySelector('.message-actions')?.remove();

        const modalHTML = `
            <div class="modal-backdrop" id="delete-modal-backdrop">
                <div class="delete-modal">
                    <h2 class="modal-title">Удалить сообщение</h2>
                    <p class="modal-subtitle">Вы действительно хотите удалить это сообщение?</p>
                    <div class="message-preview">${messageClone.outerHTML}</div>
                    <div class="hint-box">
                        <h4>ПОДСКАЗКА</h4>
                        <p>Чтобы полностью обойти это подтверждение, удерживайте Shift при нажатии на «Удалить сообщение».</p>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-button cancel-btn">Отмена</button>
                        <button class="modal-button confirm-btn">Удалить</button>
                    </div>
                </div>
            </div>
        `;
        modalContainer.innerHTML = modalHTML;

        const backdrop = modalContainer.querySelector('#delete-modal-backdrop');
        const closeModal = () => { backdrop.remove(); };

        backdrop.querySelector('.cancel-btn').addEventListener('click', closeModal);
        backdrop.querySelector('.confirm-btn').addEventListener('click', () => {
            socket.emit('delete-message', { serverId: activeServer.id, channelId: activeTextChannel.id, messageId: messageId });
            closeModal();
        });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    }
// --- ЧАСТЬ 4: ГОЛОСОВЫЕ КАНАЛЫ И WEBRTC ---

    // ИСПРАВЛЕНИЕ: Предотвращение дублирования звуков
    function playSound(soundElement) {
        soundElement.pause();
        soundElement.currentTime = 0;
        soundElement.play().catch(e => console.error("Ошибка воспроизведения звука:", e));
    }

    async function joinVoiceChannel(channel) {
        // ИСПРАВЛЕНИЕ: Гарантированный выход из предыдущего канала перед входом в новый
        if (activeVoiceChannel) await leaveVoiceChannel(false);
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            activeVoiceChannel = channel;
            lastVoiceChannel = channel;
            isVoiceFocusView = false;
            
            setupVoiceVisualizer();
            updateMuteStates();
            
            voiceStatusPanel.classList.remove('hidden');
            voiceStatusChannelName.textContent = channel.name;
            
            socket.emit('join-channel', { serverId: activeServer.id, channelId: channel.id, channelType: 'voice' });
            
            document.querySelectorAll('.channels-list .channel').forEach(c => c.classList.remove('active'));
            const channelEl = document.querySelector(`.channel[data-channel-id="${channel.id}"]`);
            if (channelEl) channelEl.classList.add('active');

        } catch (err) {
            console.error('Не удалось получить доступ к микрофону:', err);
            alert('Не удалось получить доступ к микрофону. Проверьте разрешения в браузере.');
            activeVoiceChannel = null;
        }
    }

    function leaveVoiceChannel(shouldSwitchView = true) {
        if (!activeVoiceChannel) return;

        if (shouldSwitchView) {
            if (lastActiveTextChannel) {
                setActiveChannelView('text', lastActiveTextChannel);
            } else {
                setActiveChannelView('placeholder', { title: `Добро пожаловать на ${activeServer.name}!`, text: 'Выберите канал, чтобы начать общение.' });
            }
            setActiveChannelView('disconnected', activeVoiceChannel);
        }

        if (localStream) localStream.getTracks().forEach(track => track.stop());
        if (localScreenStream) toggleMedia('screen', true);
        if (localVideoStream) toggleMedia('video', true);
        if (speakingAnimation) cancelAnimationFrame(speakingAnimation);
        
        panelAvatar.classList.remove('speaking');
        localStream = null;
        localScreenStream = null;
        localVideoStream = null;
        audioContext = null;
        isVoiceFocusView = false;

        Object.values(peerConnections).forEach(pc => pc.close());
        Object.keys(peerConnections).forEach(key => delete peerConnections[key]);
        
        document.getElementById('audio-container').innerHTML = '';
        videoGrid.innerHTML = '';

        socket.emit('leave-voice-channel');
        
        voiceStatusPanel.classList.add('hidden');
        
        const voiceChannelEl = document.querySelector(`.channel[data-channel-id="${activeVoiceChannel.id}"]`);
        if (voiceChannelEl) voiceChannelEl.classList.remove('active');

        activeVoiceChannel = null;
    }

    function setupVoiceVisualizer() {
        if (!localStream || localStream.getAudioTracks().length === 0 || !window.AudioContext) return;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(localStream);
        microphone.connect(analyser);
        analyser.fftSize = 512;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const detectSpeaking = () => {
            if (!analyser) {
                cancelAnimationFrame(speakingAnimation);
                return;
            };
            analyser.getByteFrequencyData(dataArray);
            let sum = dataArray.reduce((acc, val) => acc + val * val, 0);
            const volume = Math.sqrt(sum / dataArray.length);
            const isSpeaking = volume > 15 && !isMuted;
            
            socket.emit('speaking', { speaking: isSpeaking });
            speakingAnimation = requestAnimationFrame(detectSpeaking);
        };
        detectSpeaking();
    }

    function createPeerConnection(socketId, isInitiator) {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peerConnections[socketId] = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-signal', { to: socketId, signal: { type: 'ice-candidate', candidate: event.candidate } });
            }
        };

        pc.ontrack = (event) => {
            const user = currentVoiceUsers[activeVoiceChannel.id]?.[socketId]?.user;
            if (event.track.kind === 'video') {
                createVideoTile(socketId, event.streams[0], user);
            } else if (event.track.kind === 'audio') {
                const audioContainer = document.getElementById('audio-container');
                let audioEl = document.getElementById(`audio-${socketId}`);
                if (!audioEl) {
                    audioEl = document.createElement('audio');
                    audioEl.id = `audio-${socketId}`;
                    audioEl.autoplay = true;
                    audioContainer.appendChild(audioEl);
                }
                audioEl.srcObject = event.streams[0];
                updateDeafenState();
            }
        };
        
        if (isInitiator) {
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('webrtc-signal', { to: socketId, signal: pc.localDescription });
                } catch (err) { console.error('Ошибка при onnegotiationneeded:', err); }
            };
        }

        if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        if (localVideoStream) localVideoStream.getTracks().forEach(track => pc.addTrack(track, localVideoStream));
        if (localScreenStream) localScreenStream.getTracks().forEach(track => pc.addTrack(track, localScreenStream));

        return pc;
    }

    function updateMuteStates() {
        micBtn.classList.toggle('mic-muted', isMuted);
        vcMicBtn.classList.toggle('active', !isMuted);
        const micIcon = micBtn.querySelector('i');
        const vcMicIcon = vcMicBtn.querySelector('i');
        if (micIcon) micIcon.className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
        if (vcMicIcon) vcMicIcon.className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
        if (localStream) localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    }

    function updateDeafenState() {
        deafenBtn.classList.toggle('deafened', isDeafened);
        const icon = deafenBtn.querySelector('i');
        if(icon) icon.className = isDeafened ? 'fa-solid fa-headphones-slash' : 'fa-solid fa-headphones';
        document.querySelectorAll('#audio-container audio').forEach(audio => audio.muted = isDeafened);
    }

    async function toggleMedia(streamType, forceOff = false) {
        const streamVar = streamType === 'video' ? 'localVideoStream' : 'localScreenStream';
        const btn = streamType === 'video' ? vcCameraBtn : vcScreenBtn;
        const activeClass = 'active';
        const getMedia = streamType === 'video' 
            ? () => navigator.mediaDevices.getUserMedia({ video: true })
            : () => navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });

        if (window[streamVar] || forceOff) {
            if (window[streamVar]) {
                window[streamVar].getTracks().forEach(track => {
                    track.stop();
                    removeTrackFromPeers(track);
                });
            }
            window[streamVar] = null;
            btn.classList.remove(activeClass);
            createVideoTile(socket.id, null, currentUser);
        } else {
            try {
                const stream = await getMedia();
                window[streamVar] = stream;
                btn.classList.add(activeClass);
                const videoTrack = stream.getVideoTracks()[0];
                addTrackToPeers(videoTrack, stream);

                createVideoTile(socket.id, stream, currentUser);
                
                stream.getVideoTracks()[0].onended = () => toggleMedia(streamType, true);
            } catch (err) { console.error(`Ошибка ${streamType}:`, err); }
        }
    }

    function addTrackToPeers(track, stream) { Object.values(peerConnections).forEach(pc => pc.addTrack(track, stream)); }
    function removeTrackFromPeers(track) { Object.values(peerConnections).forEach(pc => { const sender = pc.getSenders().find(s => s.track === track); if (sender) pc.removeTrack(sender); }); }

    function createVideoTile(socketId, stream, user) {
        let wrapper = document.getElementById(`video-wrapper-${socketId}`);
        const username = user ? user.username : (socketId === socket.id ? currentUser.username : 'User');
        
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'video-wrapper';
            wrapper.id = `video-wrapper-${socketId}`;
            wrapper.dataset.socketId = socketId;
            wrapper.innerHTML = `<div class="user-tile-avatar"></div><div class="user-tile-name">${username}</div>`;
            videoGrid.appendChild(wrapper);
        }
        
        const avatarEl = wrapper.querySelector('.user-tile-avatar');
        updateAvatarDisplay(avatarEl, user?.avatar, username);

        let videoEl = wrapper.querySelector('video');
        if (stream) {
            if (!videoEl) {
                videoEl = document.createElement('video');
                videoEl.autoplay = true;
                videoEl.playsInline = true;
                if (socketId === socket.id) videoEl.muted = true;
                wrapper.insertBefore(videoEl, wrapper.firstChild);
            }
            videoEl.srcObject = stream;
            videoEl.classList.remove('hidden');
            avatarEl.classList.add('hidden');
        } else {
            if (videoEl) videoEl.remove();
            avatarEl.classList.remove('hidden');
        }
    }

    function updateVideoGridLayout() {
        if (!isVoiceFocusView) return;
        const count = videoGrid.children.length;
        videoGrid.dataset.userCount = count;
    }
// --- ЧАСТЬ 5: ОБРАБОТЧИКИ СОБЫТИЙ SOCKET.IO И ГЛОБАЛЬНЫЕ СЛУШАТЕЛИ ---

    function setupSocketListeners() {
        socket.on('connect', () => console.log('Socket connected:', socket.id));
        
        socket.on('connect_error', (err) => {
            if (err.message === "Invalid token") {
                console.log("Authentication error: Invalid token. Logging out.");
                localStorage.removeItem('token');
                authScreen.classList.remove('hidden');
                mainApp.classList.add('hidden');
                socket.disconnect();
            }
        });

        socket.on('user-settings-updated', (updatedUser) => {
            currentUser = updatedUser;
            settingsUnsavedChanges = false;
            document.getElementById('save-notice').classList.add('hidden');
            updateUserPanel(currentUser);
            if (!settingsModalBackdrop.classList.contains('hidden')) {
                openUserSettingsModal();
            }
            alert('Настройки сохранены!');
        });

        socket.on('password-changed', (data) => {
            const passwordChangeMessage = document.getElementById('password-change-message');
            passwordChangeMessage.textContent = data.message;
            passwordChangeMessage.className = `message ${data.success ? 'success' : 'error'}`;
            if (data.success) {
                setTimeout(() => changePasswordModalBackdrop.classList.add('hidden'), 2000);
            }
        });

        socket.on('server-created', (newServer) => {
            currentServers.push(newServer);
            renderServers();
            createServerModalBackdrop.classList.add('hidden');
            selectServer(newServer.id);
        });

        socket.on('server-joined', (joinedServer) => {
            if (!currentServers.some(s => s.id === joinedServer.id)) {
                currentServers.push(joinedServer);
                renderServers();
            }
            selectServer(joinedServer.id);
        });

        socket.on('server-update', (updatedServer) => {
            const serverIndex = currentServers.findIndex(s => s.id === updatedServer.id);
            if (serverIndex !== -1) currentServers[serverIndex] = updatedServer;
            if (activeServer && activeServer.id === updatedServer.id) {
                activeServer = updatedServer;
                serverNameHeader.textContent = activeServer.name;
                renderChannels(activeServer.channels);
                renderMembersList();
                if (!serverSettingsModalBackdrop.classList.contains('hidden')) {
                    openServerSettingsModal();
                }
            }
            renderServers();
        });

        socket.on('server-settings-updated', (updatedServer) => {
            const serverIndex = currentServers.findIndex(s => s.id === updatedServer.id);
            if (serverIndex !== -1) currentServers[serverIndex] = updatedServer;
            activeServer = updatedServer;
            serverSettingsUnsavedChanges = false;
            document.getElementById('server-save-notice').classList.add('hidden');
            openServerSettingsModal();
            alert('Настройки сервера сохранены!');
        });

        socket.on('server-deleted', ({ serverId }) => {
            if (activeServer && activeServer.id === serverId) {
                alert(`Сервер "${activeServer.name}" был удален владельцем.`);
                resetToHome();
            }
            currentServers = currentServers.filter(s => s.id !== serverId);
            renderServers();
        });

        socket.on('message-history', ({ channelId, history }) => {
            if (activeTextChannel && activeTextChannel.id === channelId) {
                textMessagesList.innerHTML = '';
                history.forEach(msg => renderMessage(msg));
                textMessagesList.scrollTop = textMessagesList.scrollHeight;
            }
        });

        socket.on('chat-message', (data) => {
            if (activeTextChannel && activeTextChannel.id === data.channelId) {
                renderMessage(data);
                if (document.hidden) { // Проверяем, активна ли вкладка
                    playSound(notificationSound);
                }
            }
        });

        socket.on('message-edited', ({ channelId, messageId, newMessage, editedTimestamp }) => {
            if (activeTextChannel && activeTextChannel.id === channelId) {
                const messageEl = textMessagesList.querySelector(`.message-group[data-message-id="${messageId}"]`);
                if (messageEl) {
                    const contentEl = messageEl.querySelector('.message-content');
                    contentEl.innerHTML = `${newMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")} <span class="edited-tag" title="${new Date(editedTimestamp).toLocaleString()}">(ред.)</span>`;
                }
            }
        });

        socket.on('message-deleted', ({ channelId, messageId }) => {
            if (activeTextChannel && activeTextChannel.id === channelId) {
                const messageEl = textMessagesList.querySelector(`.message-group[data-message-id="${messageId}"]`);
                if (messageEl) {
                    messageEl.querySelector('.message-content').innerHTML = `<span class="deleted-text">Это сообщение было удалено.</span>`;
                    messageEl.querySelector('.message-actions')?.remove();
                    messageEl.querySelector('.message-attachment')?.remove();
                }
            }
        });

        socket.on('voice-channels-update', ({ voiceChannels }) => {
            currentVoiceUsers = voiceChannels;
            updateAllVoiceChannelMembers();
        });

        socket.on('speaking', ({ socketId, speaking }) => {
            const userInChannelData = Object.values(currentVoiceUsers).flatMap(c => Object.values(c)).find(u => u.socketId === socketId);
            if (userInChannelData) {
                const voiceMemberEl = document.querySelector(`.voice-member[data-user-id="${userInChannelData.userId}"]`);
                if (voiceMemberEl) {
                    voiceMemberEl.querySelector('.avatar').classList.toggle('speaking', speaking);
                }
            }
            if (isVoiceFocusView) {
                const videoTile = document.getElementById(`video-wrapper-${socketId}`);
                if (videoTile) videoTile.classList.toggle('speaking', speaking);
            }
            if (socketId === socket.id) {
                panelAvatar.classList.toggle('speaking', speaking);
            }
        });

        socket.on('play-sound', ({ sound }) => {
            if (sound === 'join') playSound(joinSound);
            if (sound === 'leave') playSound(leaveSound);
        });

        socket.on('existing-voice-users', (users) => {
            if (!localStream) return;
            videoGrid.innerHTML = '';
            createVideoTile(socket.id, localVideoStream || localScreenStream, currentUser);
            Object.entries(users).forEach(([socketId, userData]) => {
                createPeerConnection(socketId, true);
                createVideoTile(socketId, null, userData.user);
            });
            updateVideoGridLayout();
        });

        socket.on('user-left-voice', ({ socketId }) => {
            if (peerConnections[socketId]) {
                peerConnections[socketId].close();
                delete peerConnections[socketId];
            }
            document.getElementById(`audio-${socketId}`)?.remove();
            document.getElementById(`video-wrapper-${socketId}`)?.remove();
            updateVideoGridLayout();
        });

        socket.on('webrtc-signal', async ({ from, signal }) => {
            let pc = peerConnections[from];
            if (!pc) pc = createPeerConnection(from, false);
            if (signal.sdp) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                    if (signal.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socket.emit('webrtc-signal', { to: from, signal: pc.localDescription });
                    }
                } catch (e) { console.error("Ошибка при установке SDP:", e); }
            } else if (signal.candidate) {
                try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (e) { console.error('Ошибка при добавлении ICE кандидата:', e); }
            }
        });
    }

    function updateAllVoiceChannelMembers() {
        if (!activeServer) return;
        document.querySelectorAll('.voice-channel-members').forEach(c => c.innerHTML = '');
        for (const channelId in currentVoiceUsers) {
            const membersContainer = document.getElementById(`members-${channelId}`);
            if (membersContainer) {
                const usersInChannel = currentVoiceUsers[channelId];
                Object.values(usersInChannel).forEach(({ user }) => {
                    const memberEl = document.createElement('div');
                    memberEl.className = 'voice-member';
                    memberEl.dataset.userId = user.id;
                    memberEl.innerHTML = `<div class="avatar"></div><span class="username">${user.username}</span>`;
                    updateAvatarDisplay(memberEl.querySelector('.avatar'), user.avatar, user.username);
                    membersContainer.appendChild(memberEl);
                });
            }
        }
    }

    function setupGlobalEventListeners() {
        homeBtn.addEventListener('click', resetToHome);
        membersToggleBtn.addEventListener('click', () => { membersSidebar.classList.toggle('hidden'); membersToggleBtn.classList.toggle('active'); });
        disconnectVoiceBtn.addEventListener('click', () => leaveVoiceChannel());
        vcLeaveBtn.addEventListener('click', () => leaveVoiceChannel());
        reconnectVoiceBtn.addEventListener('click', () => { if (lastVoiceChannel) joinVoiceChannel(lastVoiceChannel); });
        micBtn.addEventListener('click', () => { isMuted = !isMuted; updateMuteStates(); });
        vcMicBtn.addEventListener('click', () => { isMuted = !isMuted; updateMuteStates(); });
        deafenBtn.addEventListener('click', () => { isDeafened = !isDeafened; if (isDeafened) isMuted = true; updateMuteStates(); updateDeafenState(); });
        vcScreenBtn.addEventListener('click', () => toggleMedia('screen'));
        vcCameraBtn.addEventListener('click', () => toggleMedia('video'));
        textChatForm.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(textChatInput, activeTextChannel); });
        attachFileBtn.addEventListener('click', () => fileUploadInput.click());
        fileUploadInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                for (const file of e.target.files) {
                    const uploadResult = await handleFileUpload(file);
                    if (uploadResult) sendMessage(null, activeTextChannel, uploadResult.filePath);
                }
                e.target.value = '';
            }
        });
        emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPickerContainer.classList.toggle('hidden'); });
        emojiPicker.addEventListener('emoji-click', event => { textChatInput.value += event.detail.unicode; });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-input-wrapper')) emojiPickerContainer.classList.add('hidden');
            if (!e.target.closest('#server-header')) serverOptionsDropdown.classList.remove('active');
        });
        textMessagesList.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            if (editBtn) showEditUI(editBtn.closest('.message-group'));
            if (deleteBtn) {
                const messageEl = deleteBtn.closest('.message-group');
                if (e.shiftKey) {
                    socket.emit('delete-message', { serverId: activeServer.id, channelId: activeTextChannel.id, messageId: messageEl.dataset.messageId });
                } else {
                    showDeleteConfirmation(messageEl);
                }
            }
        });
        
        addServerBtn.addEventListener('click', openCreateServerModal);
        exploreServersBtn.addEventListener('click', openExploreServers);
        settingsBtn.addEventListener('click', openUserSettingsModal);
        
        channelsContainer.addEventListener('click', (e) => {
            const addBtn = e.target.closest('.channel-add-btn');
            if (addBtn) openCreateChannelModal(addBtn.dataset.type);
        });

        document.addEventListener('click', (e) => {
            if (e.target.dataset.closeModal !== undefined || e.target.classList.contains('modal-backdrop')) {
                e.target.closest('.modal-backdrop')?.classList.add('hidden');
            }
        });
        
        document.getElementById('create-server-form').addEventListener('submit', (e) => {
            e.preventDefault();
            createServerData.serverName = e.target.serverName.value;
            if (!createServerData.serverName.trim()) return;
            socket.emit('create-server', createServerData);
        });

        document.getElementById('create-channel-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const channelData = {
                channelType: formData.get('channelType'),
                channelName: formData.get('channelName'),
                isPrivate: formData.get('private') === 'on'
            };
            if (channelData.channelName.trim()) {
                socket.emit('create-channel', { serverId: activeServer.id, ...channelData });
                createChannelModalBackdrop.classList.add('hidden');
            }
        });

        document.getElementById('open-change-password-btn').addEventListener('click', () => {
            changePasswordModalBackdrop.classList.remove('hidden');
            document.getElementById('change-password-form').reset();
            document.getElementById('password-change-message').textContent = '';
        });
        document.getElementById('change-password-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const currentPassword = e.target.querySelector('#current-password').value;
            const newPassword = e.target.querySelector('#new-password').value;
            const confirmPassword = e.target.querySelector('#confirm-password').value;
            if (newPassword !== confirmPassword) {
                document.getElementById('password-change-message').textContent = 'Новые пароли не совпадают.';
                document.getElementById('password-change-message').className = 'message error';
                return;
            }
            socket.emit('change-password', { currentPassword, newPassword });
        });

        serverHeader.addEventListener('click', (e) => {
            if (e.target.closest('#server-options-dropdown')) {
                serverOptionsDropdown.classList.toggle('active');
            }
        });

        document.getElementById('server-settings-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openServerSettingsModal();
            serverOptionsDropdown.classList.remove('active');
        });

        const setupMenuSwitcher = (modal, menuItemsSelector, sectionsSelector) => {
            const menuItems = modal.querySelectorAll(menuItemsSelector);
            const sections = modal.querySelectorAll(sectionsSelector);
            menuItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (item.classList.contains('disabled')) return;
                    const sectionName = item.dataset.section;
                    menuItems.forEach(i => i.classList.toggle('active', i.dataset.section === sectionName));
                    sections.forEach(s => s.classList.toggle('active', s.id.includes(sectionName)));
                });
            });
        };
        setupMenuSwitcher(settingsModalBackdrop, '.settings-menu-item', '.settings-section');
        setupMenuSwitcher(serverSettingsModalBackdrop, '.settings-menu-item', '.settings-section');
    }

    function openCreateServerModal() {
        createServerData = {};
        document.getElementById('create-server-form').reset();
        updateAvatarDisplay(document.getElementById('create-server-avatar-preview'), null, '');
        document.getElementById('create-server-avatar-preview').classList.remove('has-image');
        document.getElementById('create-server-avatar-preview').innerHTML = '<i class="fa-solid fa-camera"></i><span>Загрузить</span>';
        createServerModalBackdrop.classList.remove('hidden');
        const steps = createServerModalBackdrop.querySelectorAll('.modal-step');
        const switchStep = (stepNum) => steps.forEach(s => s.classList.toggle('active', s.dataset.step === stepNum));
        createServerModalBackdrop.querySelectorAll('[data-next-step]').forEach(btn => {
            btn.onclick = () => {
                if (btn.dataset.template) createServerData.template = btn.dataset.template;
                if (btn.dataset.type) createServerData.type = btn.dataset.type;
                switchStep(btn.dataset.nextStep);
            };
        });
        createServerModalBackdrop.querySelectorAll('[data-prev-step]').forEach(btn => {
            btn.onclick = () => switchStep(btn.dataset.prevStep);
        });
        switchStep('1');
    }

    async function openExploreServers() {
        activeServer = null;
        activeTextChannel = null;
        if (activeVoiceChannel) leaveVoiceChannel();
        document.body.classList.add('no-members');
        document.querySelectorAll('.servers-column .server-icon').forEach(icon => icon.classList.remove('active'));
        exploreServersBtn.classList.add('active');
        serverNameHeader.textContent = 'Путешествия';
        channelsContainer.innerHTML = '';
        serverOptionsDropdown.classList.add('hidden');
        membersSidebar.classList.add('hidden');
        setActiveChannelView('explore');
        
        const exploreServersList = document.getElementById('explore-servers-list');
        const exploreFilterButtons = document.querySelectorAll('.filter-btn');
        const exploreJoinForm = document.getElementById('explore-join-server-form');

        const loadPublicServers = async (filter = 'all') => {
            try {
                const response = await fetch(`/servers/public?filter=${filter}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
                const servers = await response.json();
                exploreServersList.innerHTML = '';
                if (servers.length === 0) {
                    exploreServersList.innerHTML = '<p>Серверы не найдены.</p>';
                    return;
                }
                servers.forEach(server => {
                    const isMember = currentServers.some(s => s.id === server.id);
                    const card = document.createElement('div');
                    card.className = 'public-server-card';
                    card.innerHTML = `
                        <div class="card-banner" style="background-image: url('${server.banner || '/assets/default_banner.png'}')"><div class="card-avatar"></div></div>
                        <div class="card-body">
                            <div class="card-title"><i class="fa-solid fa-check-circle verified-icon"></i><h3>${server.name}</h3></div>
                            <p class="card-description">${server.description || 'Нет описания.'}</p>
                            <div class="card-stats"><span><i class="fa-solid fa-circle online"></i> ${server.members.length} в сети</span></div>
                            <button class="join-btn" data-code="${server.invites[0]?.code}" ${isMember ? 'disabled' : ''}>${isMember ? 'Уже на сервере' : 'Присоединиться'}</button>
                        </div>`;
                    updateAvatarDisplay(card.querySelector('.card-avatar'), server.avatar, server.name);
                    exploreServersList.appendChild(card);
                });
            } catch (err) { exploreServersList.innerHTML = '<p>Ошибка при загрузке серверов.</p>'; }
        };

        exploreFilterButtons.forEach(btn => btn.onclick = () => {
            exploreFilterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadPublicServers(btn.dataset.filter);
        });
        exploreServersList.onclick = (e) => {
            if (e.target.classList.contains('join-btn') && !e.target.disabled) {
                socket.emit('join-server', { inviteCode: e.target.dataset.code });
            }
        };
        exploreJoinForm.onsubmit = (e) => {
            e.preventDefault();
            const code = e.target.querySelector('#explore-invite-code').value.trim();
            if(code) socket.emit('join-server', { inviteCode: code });
            e.target.reset();
        };
        loadPublicServers();
    }

    function openUserSettingsModal() {
        updateAvatarDisplay(document.getElementById('settings-avatar'), currentUser.avatar, currentUser.username);
        document.getElementById('settings-username').textContent = currentUser.username;
        document.getElementById('username-edit-input').value = currentUser.username;
        document.getElementById('username-edit-input').setAttribute('readonly', true);
        document.getElementById('profile-description').value = currentUser.description || '';
        settingsUnsavedChanges = false;
        document.getElementById('save-notice').classList.add('hidden');
        settingsModalBackdrop.classList.remove('hidden');
    }

    function openCreateChannelModal(type) {
        document.getElementById('create-channel-form').reset();
        document.querySelector(`input[name="channelType"][value="${type}"]`).checked = true;
        document.getElementById('create-channel-subtitle').textContent = `в ${type === 'text' ? 'Текстовые каналы' : 'Голосовые каналы'}`;
        createChannelModalBackdrop.classList.add('hidden');
    }

    function openServerSettingsModal() {
        if (!activeServer) return;
        // Здесь должна быть логика заполнения полей настроек сервера
        serverSettingsModalBackdrop.classList.remove('hidden');
    }
});
