#!/bin/bash

# Javis Studio 一键重启脚本
# 用法: ./restart.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_PORT=8000
FRONTEND_PORT=3000

echo "🛑 Stopping old processes..."

# Kill backend processes (uvicorn/python on port 8000)
if lsof -ti:$BACKEND_PORT > /dev/null 2>&1; then
    echo "  Killing backend on port $BACKEND_PORT..."
    lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null || true
fi

# Kill frontend processes (node/next on port 3000)
if lsof -ti:$FRONTEND_PORT > /dev/null 2>&1; then
    echo "  Killing frontend on port $FRONTEND_PORT..."
    lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null || true
fi

# Also kill by process name as fallback
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "node.*next" 2>/dev/null || true

echo "✅ Old processes stopped"
echo ""

# Wait a moment for ports to be released
sleep 1

echo "🚀 Starting backend service..."
cd "$BACKEND_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Creating one..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies if needed
if ! pip show fastapi > /dev/null 2>&1; then
    echo "📦 Installing backend dependencies..."
    pip install -r requirements.txt
fi

# Start backend in background
python -m uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT --reload > "$PROJECT_ROOT/backend.log" 2>&1 &
BACKEND_PID=$!

echo "  Backend PID: $BACKEND_PID"
echo "  Log file: $PROJECT_ROOT/backend.log"
echo ""

# Wait for backend to be ready
echo "⏳ Waiting for backend to start..."
for i in {1..30}; do
    if curl -s http://localhost:$BACKEND_PORT/health > /dev/null 2>&1; then
        echo "✅ Backend is ready at http://localhost:$BACKEND_PORT"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo "⚠️  Backend startup timeout. Check $PROJECT_ROOT/backend.log"
    fi
done
echo ""

echo "🚀 Starting frontend service..."
cd "$FRONTEND_DIR"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Start frontend in background
npm run dev > "$PROJECT_ROOT/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo "  Frontend PID: $FRONTEND_PID"
echo "  Log file: $PROJECT_ROOT/frontend.log"
echo ""

# Wait for frontend to be ready
echo "⏳ Waiting for frontend to start..."
for i in {1..30}; do
    if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
        echo "✅ Frontend is ready at http://localhost:$FRONTEND_PORT"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo "⚠️  Frontend startup timeout. Check $PROJECT_ROOT/frontend.log"
    fi
done
echo ""

echo "========================================"
echo "🎉 Javis Studio 服务已启动!"
echo "========================================"
echo ""
echo "🔗 访问地址:"
echo "  - 前端: http://localhost:$FRONTEND_PORT"
echo "  - 后端: http://localhost:$BACKEND_PORT"
echo "  - API文档: http://localhost:$BACKEND_PORT/docs"
echo ""
echo "📋 查看日志:"
echo "  tail -f $PROJECT_ROOT/backend.log"
echo "  tail -f $PROJECT_ROOT/frontend.log"
echo ""
echo "🛑 停止服务:"
echo "  ./stop.sh"
echo "========================================"

# Save PIDs to files for stop script
echo $BACKEND_PID > "$PROJECT_ROOT/.backend.pid"
echo $FRONTEND_PID > "$PROJECT_ROOT/.frontend.pid"
