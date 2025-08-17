const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http'  );
const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const server = http.createServer(app  );
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-super-secret-key-that-is-long-and-random';

// --- Настройка Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- Управление данными ---
const dataDir = path.join(__dirname, 'data');
const usersDir = path.join(dataDir, 'users');
const serversDir = path.join(dataDir, 'servers');
const uploadsDir = path.join(__dirname, 'public/uploads');

[usersDir, serversDir, uploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const readData = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
};

const writeData = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error);
    }
};

const channelTemplates = {
    games: { text: ['общий', 'анонсы', 'поиск-пати'], voice: ['Лобби', 'Игровая 1', 'Игровая 2'] },
    music: { text: ['общий', 'новинки', 'обсуждения'], voice: ['Музыкальная комната', 'Чилаут'] },
    movies: { text: ['общий', 'что-посмотреть', 'спойлеры'], voice: ['Кинозал', 'Обсуждение'] }
};

// --- Настройка Multer для загрузки файлов ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// --- Middleware для аутентификации ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Нет токена, авторизация отклонена' });
    }
    try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ message: 'Невалидный токен' });
    }
};

// --- Маршруты API ---

// Регистрация
app.post('/register', (req, res) => {
    const { login, username, password } = req.body;
    if (!login || !username || !password) return res.status(400).json({ message: 'Все поля обязательны.' });

    const userFiles = fs.readdirSync(usersDir);
    const loginExists = userFiles.some(file => readData(path.join(usersDir, file))?.login === login);
    if (loginExists) return res.status(409).json({ message: 'Этот логин уже занят.' });
    
    const usernameExists = userFiles.some(file => readData(path.join(usersDir, file))?.username === username);
    if (usernameExists) return res.status(409).json({ message: 'Этот никнейм уже занят.' });

    const userId = crypto.randomUUID();
    const userData = { 
        id: userId, 
        login, 
        username, 
        password,
        description: '', 
        avatar: null,
        createdAt: new Date().toISOString() 
    };
    writeData(path.join(usersDir, `${userId}.json`), userData);
    res.status(201).json({ message: 'Регистрация прошла успешно!' });
});

// Вход
app.post('/login', (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ message: 'Логин и пароль обязательны.' });

    const userFiles = fs.readdirSync(usersDir);
    const foundUserFile = userFiles.find(file => readData(path.join(usersDir, file))?.login === login);

    if (!foundUserFile) {
        return res.status(404).json({ message: 'Пользователь с таким логином не найден.' });
    }
    
    const foundUser = readData(path.join(usersDir, foundUserFile));

    if (foundUser.password === password) {
        const { password, ...userToSend } = foundUser;
        const token = jwt.sign({ id: userToSend.id }, JWT_SECRET, { expiresIn: '1d' });
        res.status(200).json({ message: 'Вход выполнен успешно!', user: userToSend, token });
    } else {
        res.status(401).json({ message: 'Неверный пароль.' });
    }
});

// Получение профиля по токену
app.get('/profile', authMiddleware, (req, res) => {
    const userData = readData(path.join(usersDir, `${req.user.id}.json`));
    if (!userData) return res.status(404).json({ message: 'Пользователь не найден' });
    const { password, ...userToSend } = userData;
    res.json({ user: userToSend });
});

// Загрузка файлов
app.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Файл не был загружен' });
    const filePath = `/uploads/${req.file.filename}`;
    res.status(200).json({ message: 'Файл успешно загружен', filePath });
});

// Получение списка серверов пользователя
app.get('/servers', authMiddleware, (req, res) => {
    const userServers = [];
    const serverDirs = fs.readdirSync(serversDir);
    for (const dir of serverDirs) {
        const serverData = readData(path.join(serversDir, dir, 'server.json'));
        if (serverData && serverData.members.some(m => m.userId === req.user.id)) {
            userServers.push(serverData);
        }
    }
    res.status(200).json(userServers);
});

// Получение публичных серверов
app.get('/servers/public', authMiddleware, (req, res) => {
    const { filter } = req.query;
    const publicServers = [];
    const serverDirs = fs.readdirSync(serversDir);
    for (const dir of serverDirs) {
        const serverData = readData(path.join(serversDir, dir, 'server.json'));
        if (serverData && serverData.type === 'public') {
            if (filter && filter !== 'all' && serverData.template !== filter) continue;
            // Добавляем инвайт-код для публичных серверов
            const permanentInvite = serverData.invites.find(inv => inv.maxUses === 0);
            if (permanentInvite) {
                serverData.inviteCode = permanentInvite.code;
            }
            publicServers.push(serverData);
        }
    }
    res.status(200).json(publicServers);
});

// Получение данных конкретного сервера
app.get('/servers/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const serverPath = path.join(serversDir, id, 'server.json');
    const serverData = readData(serverPath);

    if (!serverData || !serverData.members.some(m => m.userId === req.user.id)) {
        return res.status(404).json({ message: 'Сервер не найден или у вас нет доступа.' });
    }

    serverData.users = {};
    serverData.members.forEach(member => {
        const userData = readData(path.join(usersDir, `${member.userId}.json`));
        if (userData) {
            const { password, ...userSafeData } = userData;
            serverData.users[member.userId] = userSafeData;
        }
    });

    res.status(200).json(serverData);
});

// --- Логика Socket.IO ---
const voiceChannelUsers = {}; // { channelId: { socketId: { userId, user, serverId } } }

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    try {
        socket.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        next(new Error("Invalid token"));
    }
});

io.on('connection', (socket) => {
    const userId = socket.user.id;

    // Присоединяем сокет ко всем комнатам серверов, где он состоит
    const serverDirs = fs.readdirSync(serversDir);
    for (const dir of serverDirs) {
        const serverData = readData(path.join(serversDir, dir, 'server.json'));
        if (serverData && serverData.members.some(m => m.userId === userId)) {
            socket.join(dir); // Присоединяемся к комнате с ID сервера
        }
    }

    socket.on('create-server', (data) => {
        const { serverName, type, template, avatar } = data;
        if (!serverName) return;

        const serverId = crypto.randomUUID();
        const serverDir = path.join(serversDir, serverId);
        fs.mkdirSync(serverDir, { recursive: true });

        const templateChannels = channelTemplates[template] || channelTemplates.games;

        const serverData = {
            id: serverId,
            name: serverName,
            ownerId: userId,
            type: type || 'private',
            template: template || 'games',
            avatar: avatar || null,
            description: '',
            banner: null,
            members: [{ userId: userId, roles: ['owner'] }],
            channels: {
                text: templateChannels.text.map(name => ({ id: crypto.randomUUID(), name, private: false })),
                voice: templateChannels.voice.map(name => ({ id: crypto.randomUUID(), name, private: false }))
            },
            roles: [
                { id: 'owner', name: 'Владелец', permissions: ['all'], position: 999 },
                { id: 'member', name: 'Участник', permissions: [], position: 0 }
            ],
            invites: [{
                code: crypto.randomBytes(4).toString('hex'),
                uses: 0,
                maxUses: 0,
                creatorId: userId
            }],
            createdAt: new Date().toISOString()
        };
        writeData(path.join(serverDir, 'server.json'), serverData);
        socket.join(serverId); // Присоединяем создателя к комнате сервера
        socket.emit('server-created', serverData);
    });

    socket.on('join-server', ({ inviteCode }) => {
        let serverFound = null;
        let serverId = null;

        const serverDirs = fs.readdirSync(serversDir);
        for (const dir of serverDirs) {
            const serverData = readData(path.join(serversDir, dir, 'server.json'));
            if (!serverData || !serverData.invites) continue;
            const invite = serverData.invites.find(inv => inv.code === inviteCode);
            if (invite) {
                if (invite.maxUses !== 0 && invite.uses >= invite.maxUses) continue;
                invite.uses++;
                serverFound = serverData;
                serverId = dir;
                break;
            }
        }

        if (!serverFound) return;
        if (serverFound.members.some(m => m.userId === userId)) return;

        serverFound.members.push({ userId, roles: ['member'] });
        writeData(path.join(serversDir, serverId, 'server.json'), serverFound);
        
        socket.join(serverId); // Присоединяем нового участника к комнате сервера

        // СИСТЕМНОЕ УВЕДОМЛЕНИЕ
        const generalChannel = serverFound.channels.text.find(c => c.name === 'общий');
        if (generalChannel) {
            const userData = readData(path.join(usersDir, `${userId}.json`));
            const message = {
                id: crypto.randomUUID(),
                type: 'system', // Тип для особой отрисовки
                message: `**${userData.username}** присоединился к серверу.`,
                timestamp: new Date()
            };
            const messagesPath = path.join(serversDir, serverId, `${generalChannel.id}.json`);
            const history = readData(messagesPath) || [];
            history.push(message);
            writeData(messagesPath, history);
            io.to(`${serverId}-${generalChannel.id}`).emit('chat-message', { ...message, channelId: generalChannel.id });
        }

        io.to(serverId).emit('server-update', serverFound);
        socket.emit('server-joined', serverFound);
    });

    socket.on('update-user-settings', (data) => {
        const userPath = path.join(usersDir, `${userId}.json`);
        const userData = readData(userPath);
        if (userData) {
            userData.username = data.username || userData.username;
            userData.description = data.description ?? userData.description;
            userData.avatar = data.avatar ?? userData.avatar;
            writeData(userPath, userData);
            const { password, ...userToSend } = userData;
            socket.emit('user-settings-updated', userToSend);
        }
    });

    socket.on('change-password', ({ currentPassword, newPassword }) => {
        const userPath = path.join(usersDir, `${userId}.json`);
        const userData = readData(userPath);
        if (!userData || userData.password !== currentPassword) {
            return socket.emit('password-changed', { success: false, message: 'Текущий пароль неверен.' });
        }
        userData.password = newPassword;
        writeData(userPath, userData);
        socket.emit('password-changed', { success: true, message: 'Пароль успешно изменен.' });
    });

    socket.on('update-server-settings', ({ serverId, settings }) => {
        const serverPath = path.join(serversDir, serverId, 'server.json');
        const serverData = readData(serverPath);
        if (serverData && serverData.ownerId === userId) {
            Object.assign(serverData, settings);
            writeData(serverPath, serverData);
            io.to(serverId).emit('server-settings-updated', serverData);
        }
    });

    socket.on('generate-new-invite', ({ serverId }) => {
        const serverPath = path.join(serversDir, serverId, 'server.json');
        const serverData = readData(serverPath);
        if (serverData && serverData.ownerId === userId) {
            serverData.invites = serverData.invites.filter(inv => inv.maxUses !== 0);
            const newInvite = {
                code: crypto.randomBytes(4).toString('hex'),
                uses: 0, maxUses: 0, creatorId: userId
            };
            serverData.invites.push(newInvite);
            writeData(serverPath, serverData);
            io.to(serverId).emit('server-update', serverData);
        }
    });

    socket.on('create-channel', ({ serverId, channelType, channelName, isPrivate }) => {
        const serverPath = path.join(serversDir, serverId, 'server.json');
        const serverData = readData(serverPath);
        if (serverData) {
            const newChannel = { id: crypto.randomUUID(), name: channelName, private: isPrivate };
            serverData.channels[channelType].push(newChannel);
            writeData(serverPath, serverData);
            io.to(serverId).emit('server-update', serverData);
        }
    });

    socket.on('delete-server', ({ serverId }) => {
        const serverPath = path.join(serversDir, serverId, 'server.json');
        const serverData = readData(serverPath);
        if (serverData && serverData.ownerId === userId) {
            fs.rmSync(path.join(serversDir, serverId), { recursive: true, force: true });
            io.to(serverId).emit('server-deleted', { serverId });
        }
    });

    socket.on('join-channel', ({ serverId, channelId, channelType }) => {
        const room = `${serverId}-${channelId}`;
        socket.join(room);

        if (channelType === 'voice') {
            leaveVoiceChannel(socket, false); // Покидаем предыдущий канал без звука
            if (!voiceChannelUsers[channelId]) voiceChannelUsers[channelId] = {};
            const userData = readData(path.join(usersDir, `${userId}.json`));
            const { password, ...userSafeData } = userData;
            voiceChannelUsers[channelId][socket.id] = { userId, user: userSafeData, serverId };
            
            const usersInChannel = { ...voiceChannelUsers[channelId] };
            delete usersInChannel[socket.id];
            socket.emit('existing-voice-users', usersInChannel);
            
            // ОБНОВЛЕНИЕ УЧАСТНИКОВ ДЛЯ ВСЕХ
            io.to(serverId).emit('voice-channels-update', { voiceChannels: voiceChannelUsers });
            // ЗВУК ПОДКЛЮЧЕНИЯ
            io.to(serverId).emit('play-sound', { sound: 'join', userId: userId });
        }
        
        const messagesPath = path.join(serversDir, serverId, `${channelId}.json`);
        socket.emit('message-history', { channelId, history: readData(messagesPath) || [] });
    });

    socket.on('chat-message', ({ serverId, channelId, message, attachment }) => {
        const room = `${serverId}-${channelId}`;
        const userData = readData(path.join(usersDir, `${userId}.json`));
        const { password, ...userSafeData } = userData;
        const newMessage = { 
            id: crypto.randomUUID(), 
            user: userSafeData, 
            message, 
            attachment,
            timestamp: new Date(),
            edited: false,
            deleted: false,
            type: 'user'
        };
        
        const messagesPath = path.join(serversDir, serverId, `${channelId}.json`);
        const history = readData(messagesPath) || [];
        history.push(newMessage);
        writeData(messagesPath, history);
        
        io.to(room).emit('chat-message', { ...newMessage, channelId });
    });

    socket.on('edit-message', ({ serverId, channelId, messageId, newMessage }) => {
        const messagesPath = path.join(serversDir, serverId, `${channelId}.json`);
        let history = readData(messagesPath) || [];
        const messageIndex = history.findIndex(m => m.id === messageId && m.user.id === userId);

        if (messageIndex !== -1) {
            history[messageIndex].message = newMessage;
            history[messageIndex].edited = true;
            history[messageIndex].editedTimestamp = new Date(); // Добавляем время редактирования
            writeData(messagesPath, history);
            io.to(`${serverId}-${channelId}`).emit('message-edited', { channelId, messageId, newMessage, editedTimestamp: history[messageIndex].editedTimestamp });
        }
    });

    socket.on('delete-message', ({ serverId, channelId, messageId }) => {
        const messagesPath = path.join(serversDir, serverId, `${channelId}.json`);
        let history = readData(messagesPath) || [];
        const messageIndex = history.findIndex(m => m.id === messageId && m.user.id === userId);

        if (messageIndex !== -1) {
            history[messageIndex].deleted = true;
            history[messageIndex].message = '';
            history[messageIndex].attachment = null;
            writeData(messagesPath, history);
            io.to(`${serverId}-${channelId}`).emit('message-deleted', { channelId, messageId });
        }
    });

    socket.on('webrtc-signal', (data) => {
        io.to(data.to).emit('webrtc-signal', { from: socket.id, signal: data.signal });
    });

    socket.on('speaking', ({ speaking }) => {
        for (const channelId in voiceChannelUsers) {
            if (voiceChannelUsers[channelId][socket.id]) {
                const { serverId } = voiceChannelUsers[channelId][socket.id];
                // Отправляем событие всем на сервере
                io.to(serverId).emit('speaking', { socketId: socket.id, speaking });
                break;
            }
        }
    });

    const leaveVoiceChannel = (socketInstance, playSound = true) => {
        let serverToUpdate = null;
        let userWhoLeft = null;
        for (const channelId in voiceChannelUsers) {
            if (voiceChannelUsers[channelId][socketInstance.id]) {
                const { serverId, userId } = voiceChannelUsers[channelId][socketInstance.id];
                serverToUpdate = serverId;
                userWhoLeft = userId;
                
                delete voiceChannelUsers[channelId][socketInstance.id];
                if (Object.keys(voiceChannelUsers[channelId]).length === 0) {
                    delete voiceChannelUsers[channelId];
                }
                
                socketInstance.to(`${serverId}-${channelId}`).emit('user-left-voice', { socketId: socketInstance.id });
                break;
            }
        }
        if (serverToUpdate) {
            io.to(serverToUpdate).emit('voice-channels-update', { voiceChannels: voiceChannelUsers });
            if (playSound) {
                io.to(serverToUpdate).emit('play-sound', { sound: 'leave', userId: userWhoLeft });
            }
        }
    };

    socket.on('leave-voice-channel', () => leaveVoiceChannel(socket));
    socket.on('disconnect', () => {
        leaveVoiceChannel(socket);
    });
});

server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`  );
});
