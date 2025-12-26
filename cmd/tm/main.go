// tm - Thymer queue CLI
//
// Usage:
//   cat README.md | tm              Push markdown to queue (action: append)
//   echo "Meeting notes" | tm       Push to queue
//   tm lifelog Had coffee           Push lifelog entry
//   tm --collection "Tasks" < x.md  Push with collection target
//
// Config: Set THYMER_URL and THYMER_TOKEN environment variables
//         or create ~/.config/tm/config with url= and token= lines
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	URL   string
	Token string
}

type QueueRequest struct {
	Content    string `json:"content"`
	Action     string `json:"action,omitempty"`
	Collection string `json:"collection,omitempty"`
	Title      string `json:"title,omitempty"`
}

func main() {
	config := loadConfig()

	if config.URL == "" || config.Token == "" {
		fmt.Fprintln(os.Stderr, "Error: THYMER_URL and THYMER_TOKEN required")
		fmt.Fprintln(os.Stderr, "Set environment variables or create ~/.config/tm/config")
		os.Exit(1)
	}

	// Parse arguments
	args := os.Args[1:]
	req := QueueRequest{Action: "append"}

	// Parse flags
	i := 0
	for i < len(args) {
		switch args[i] {
		case "--collection", "-c":
			if i+1 < len(args) {
				req.Collection = args[i+1]
				i += 2
				continue
			}
		case "--title", "-t":
			if i+1 < len(args) {
				req.Title = args[i+1]
				i += 2
				continue
			}
		case "--action", "-a":
			if i+1 < len(args) {
				req.Action = args[i+1]
				i += 2
				continue
			}
		case "lifelog":
			req.Action = "lifelog"
			// Rest of args become the content
			if i+1 < len(args) {
				req.Content = strings.Join(args[i+1:], " ")
			}
			i = len(args)
			continue
		case "create":
			req.Action = "create"
			i++
			continue
		case "--help", "-h":
			printUsage()
			return
		}
		i++
	}

	// If no content from args, read from stdin
	if req.Content == "" {
		stat, _ := os.Stdin.Stat()
		if (stat.Mode() & os.ModeCharDevice) == 0 {
			data, err := io.ReadAll(os.Stdin)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error reading stdin: %v\n", err)
				os.Exit(1)
			}
			req.Content = string(data)
		}
	}

	if req.Content == "" {
		printUsage()
		os.Exit(1)
	}

	// Send to queue
	if err := sendToQueue(config, req); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✓ Queued %d bytes (%s)\n", len(req.Content), req.Action)
}

func sendToQueue(config Config, req QueueRequest) error {
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	httpReq, err := http.NewRequest("POST", config.URL+"/queue", bytes.NewReader(body))
	if err != nil {
		return err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+config.Token)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func loadConfig() Config {
	config := Config{
		URL:   os.Getenv("THYMER_URL"),
		Token: os.Getenv("THYMER_TOKEN"),
	}

	// Try config file if env vars not set
	if config.URL == "" || config.Token == "" {
		home, _ := os.UserHomeDir()
		configPath := filepath.Join(home, ".config", "tm", "config")
		data, err := os.ReadFile(configPath)
		if err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "url=") {
					config.URL = strings.TrimPrefix(line, "url=")
				}
				if strings.HasPrefix(line, "token=") {
					config.Token = strings.TrimPrefix(line, "token=")
				}
			}
		}
	}

	return config
}

func printUsage() {
	fmt.Println("tm - Thymer queue CLI")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  cat file.md | tm                    Push markdown to Thymer")
	fmt.Println("  echo 'note' | tm                    Push text to Thymer")
	fmt.Println("  tm lifelog Had coffee with Alex     Push lifelog entry")
	fmt.Println("  tm --collection 'Tasks' < todo.md   Push to specific collection")
	fmt.Println("  tm create --title 'New Note'        Create new record")
	fmt.Println()
	fmt.Println("Actions:")
	fmt.Println("  append (default)  Append to daily page")
	fmt.Println("  lifelog           Add timestamped lifelog entry")
	fmt.Println("  create            Create new record in collection")
	fmt.Println()
	fmt.Println("Config:")
	fmt.Println("  Set THYMER_URL and THYMER_TOKEN environment variables")
	fmt.Println("  Or create ~/.config/tm/config with:")
	fmt.Println("    url=https://your-worker.workers.dev")
	fmt.Println("    token=your-secret-token")
}
