#!/bin/bash

# Configurable parameters with defaults
SCRIPT_NAME="${1:-app.js}"
NODE_EXECUTABLE="node"
SLEEP_INTERVAL_SECONDS="${2:-30}"
LOG_FOLDER="logs"
PID_FILE="$LOG_FOLDER/script.pid"

DATE=$(date '+%Y-%m-%d')

LOG_FILE="$DATE.log"

# ANSI color codes
INFO_COLOR='\033[0;34m'
ERROR_COLOR='\033[0;31m'
SUCCESS_COLOR='\033[0;32m'
NC='\033[0m' # No Color

# Function to cleanup before exit
cleanup() {
    local exit_status=$?
    
    # Terminate child processes and remove PID file
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        pkill -P $pid
        rm "$PID_FILE"
    fi
    
    exit $exit_status
}

# Trap script termination
trap cleanup EXIT

log() {
    local message="$1"
    local log_file="$LOG_FOLDER/$LOG_FILE"

    # Append both stdout and stderr to the log file
    {
        echo -e "$(date '+%H:%M:%S'): $message"
    } | tee -a "$log_file"
}

if ! command -v "$NODE_EXECUTABLE" &> /dev/null; then
    log "${ERROR_COLOR}Node.js executable not found. Please install Node.js.${NC}"
    exit 1
fi

if [ ! -f "$SCRIPT_NAME" ]; then
    log "${ERROR_COLOR}Script file '$SCRIPT_NAME' not found.${NC}"
    exit 1
fi

# Initial message

clear

log "Script starting: $SCRIPT_NAME"
# Run the script in the background, capturing both stdout and stderr to the log file
$NODE_EXECUTABLE "$SCRIPT_NAME" 2>&1 | tee -a "$LOG_FOLDER/$LOG_FILE" &

log "${SUCCESS_COLOR}Started $SCRIPT_NAME with PID $!.${NC}"
log "${INFO_COLOR}Logging to $LOG_FOLDER/$LOG_FILE${NC}"

echo $! > "$PID_FILE"

while true; do
    if ! pgrep -f "$SCRIPT_NAME" > /dev/null; then
        log "${ERROR_COLOR}$SCRIPT_NAME is not running. Restarting...${NC}"
        
        # Restart the script and update the PID file
        $NODE_EXECUTABLE "$SCRIPT_NAME" 2>&1 | tee -a "$LOG_FOLDER/$LOG_FILE" &
        log "${SUCCESS_COLOR}Restarted $SCRIPT_NAME with PID $!.${NC}"
        echo $! > "$PID_FILE"
    fi
    
    sleep "$SLEEP_INTERVAL_SECONDS"
done
