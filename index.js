import {PrismaClient} from '@prisma/client';
import express from 'express';
import path from 'path';
import {createServer} from 'http';
import {Server} from 'socket.io';
import {fileURLToPath} from 'url';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const port = process.env.PORT || 3000

httpServer.listen(port, () => {
    console.log('Server listening at port %d', port);
});
const client = new PrismaClient()
// Routing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom

let numUsers = 0;

io.on('connection', (socket) => {
    let addedUser = false;

    socket.on('new message', async (data) => {
        if (!socket.userId) return;

        const savedMessage = await client.message.create({
            data: {
                text: data,
                sender: { connect: { id: socket.userId } },
            }
        });

        console.log(savedMessage);

        socket.broadcast.emit('new message', {
            username: socket.username,
            message: data
        });
    });

    socket.on('add user', async (username) => {
        if (addedUser) return;

        let user = await client.user.findUnique({
            where: {username}
        });

        if (!user) {
            user = await client.user.create({
                data: {username, password: ""}
            });
            console.log(user);
        }

        socket.userId = user.id;
        socket.username = username;

        ++numUsers;
        addedUser = true;

        const messages = await client.message.findMany({
            orderBy: { created_at: 'asc' },
            include: { sender: true }
        });

        socket.emit('load messages', messages);

        socket.emit('login', { numUsers });
        socket.broadcast.emit('user joined', { username: socket.username, numUsers });
    });

    socket.on('typing', () => {
        socket.broadcast.emit('typing', {
            username: socket.username
        });
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing', {
            username: socket.username
        });
    });

    socket.on('disconnect', () => {
        if (addedUser) {
            --numUsers;

            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers
            });
        }
    });
});
