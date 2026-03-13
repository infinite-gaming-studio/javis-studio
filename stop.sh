#!/bin/bash

# Javis Studio 停止服务脚本
# 用法: ./stop.sh

PROJECT_ROOT="/Users/nvozi/Coding/ai-based-projects/javis-studio"
BACKEND_PORT=8000
FRONTEND_PORT=3000

echo "🛑 Stopping Javis Studio services..."
echo ""

# Try to kill by PID files first
if [ -f "$PROJECT_ROOT/.backend.pid" ]; then
    BACKEND_PID=$(cat "$PROJECT_ROOT/.backend.pid")
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "  Stopping backend (PID: $BACKEND_PID)..."
        kill $BACKEND_PID 2>/dev/null || kill -9 $BACKEND_PID 2>/dev/null || true
    fi
    rm -f "$PROJECT_ROOT/.backend.pid"
fi

if [ -f "$PROJECT_ROOT/.frontend.pid" ]; then
    FRONTEND_PID=$(cat "$PROJECT_ROOT/.frontend.pid")
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "  Stopping frontend (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID 2>/dev/null || kill -9 $FRONTEND_PID 2>/dev/null || true
    fi
    rm -f "$PROJECT_ROOT/.frontend.pid"
fi

# Kill by port as fallback
if lsof -ti:$BACKEND_PORT > /dev/null 2>&1; then
    echo "  Killing backend on port $BACKEND_PORT..."
    lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null || true
fi

if lsof -ti:$FRONTEND_PORT > /dev/null 2>&1; then
    echo "  Killing frontend on port $FRONTEND_PORT..."
    lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null || true
fi

# Kill by process name
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "node.*next" 2>/dev/null || true

echo ""
echo "✅ All services stopped!"
