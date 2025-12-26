// tm - Thymer Markdown bridge CLI
//
// Usage:
//   cat README.md | tm     Serve markdown until Thymer picks it up
//   echo "# Hello" | tm    Serve markdown until Thymer picks it up
//   tm server              Start persistent bridge server (optional)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

const (
	defaultPort = "3000"
	defaultHost = "localhost"
	timeout     = 60 * time.Second
)

func main() {
	// Persistent server mode
	if len(os.Args) > 1 && os.Args[1] == "server" {
		runPersistentServer()
		return
	}

	// Check if we have stdin data
	stat, _ := os.Stdin.Stat()
	if (stat.Mode() & os.ModeCharDevice) == 0 {
		// Data is being piped in - serve until picked up
		serveOnce()
		return
	}

	// No args, no stdin - show usage
	fmt.Println("tm - Thymer Markdown bridge")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  cat file.md | tm       Serve markdown until Thymer picks it up")
	fmt.Println("  echo '# Hello' | tm    Serve markdown until Thymer picks it up")
	fmt.Println("  tm server              Start persistent server (optional)")
	fmt.Println()
	fmt.Println("Enable the bridge in Thymer by clicking '🪄 skill' in the status bar.")
}

// serveOnce - read stdin, serve it once, then exit
func serveOnce() {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading stdin: %v\n", err)
		os.Exit(1)
	}

	if len(data) == 0 {
		fmt.Fprintln(os.Stderr, "No input received")
		os.Exit(1)
	}

	markdown := string(data)
	served := make(chan struct{})
	var once sync.Once

	mux := http.NewServeMux()

	// GET /pending - Thymer plugin polls this
	mux.HandleFunc("/pending", func(w http.ResponseWriter, r *http.Request) {
		// CORS for browser
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Serve the content
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"markdown": markdown,
		})

		// Signal that we've served the content
		once.Do(func() {
			close(served)
		})
	})

	server := &http.Server{
		Addr:    fmt.Sprintf("%s:%s", defaultHost, defaultPort),
		Handler: mux,
	}

	// Start server in background
	go func() {
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}()

	fmt.Printf("🪄 Waiting for Thymer to pick up %d bytes...\n", len(data))

	// Wait for content to be served or timeout
	select {
	case <-served:
		fmt.Println("✓ Delivered to Thymer")
	case <-time.After(timeout):
		fmt.Fprintln(os.Stderr, "⏱ Timeout - is the Thymer bridge enabled?")
		os.Exit(1)
	}

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	server.Shutdown(ctx)
}

// runPersistentServer - traditional server mode for multiple sends
func runPersistentServer() {
	var (
		queue []string
		mu    sync.Mutex
	)

	// POST /send - receive markdown from another CLI instance
	http.HandleFunc("/send", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var req struct {
			Markdown string `json:"markdown"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		mu.Lock()
		queue = append(queue, req.Markdown)
		mu.Unlock()

		fmt.Printf("📥 Queued %d bytes of markdown\n", len(req.Markdown))
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"queued"}`))
	})

	// GET /pending - Thymer plugin polls this
	http.HandleFunc("/pending", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		mu.Lock()
		defer mu.Unlock()

		if len(queue) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		markdown := queue[0]
		queue = queue[1:]

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"markdown": markdown,
		})
		fmt.Printf("📤 Sent %d bytes to Thymer\n", len(markdown))
	})

	addr := fmt.Sprintf("%s:%s", defaultHost, defaultPort)
	fmt.Printf("🪄 Persistent bridge server on http://%s\n", addr)
	fmt.Println("   Ctrl+C to stop")
	fmt.Println()

	if err := http.ListenAndServe(addr, nil); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
