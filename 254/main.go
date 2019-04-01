// Play around with annotated go.mod files
// and visualizing module graphs,
// using a Go module proxy.
package main

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/shurcooL/go/osutil"
	"github.com/shurcooL/httperror"
	"github.com/shurcooL/httpgzip"
	"golang.org/x/net/context/ctxhttp"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	fs := httpgzip.FileServer(http.Dir("_data"), httpgzip.FileServerOptions{IndexHTML: true})

	v, ok := os.LookupEnv("PLAY254_GOPROXY")
	if !ok {
		return fmt.Errorf("a Go module proxy must be provided via PLAY254_GOPROXY env var")
	}
	proxy, err := url.Parse(v)
	if err != nil {
		return err
	}

	log.Println("serving at http://localhost:8080")
	return http.ListenAndServe("localhost:8080", errorHandler{handler{fs: fs, proxy: *proxy}.ServeHTTP})
}

type handler struct {
	fs    http.Handler
	proxy url.URL
}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) error {
	switch {
	case req.URL.Path == "/-/style.css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		return serveFile(w, req, filepath.Join("_data", "style.css"))
	case req.URL.Path == "/-/wasm_exec.js":
		w.Header().Set("Content-Type", "application/javascript")
		return serveFile(w, req, filepath.Join("_data", "wasm_exec.js"))
	case req.URL.Path == "/-/main.wasm":
		tempDir, err := ioutil.TempDir("", "")
		if err != nil {
			return err
		}
		defer os.RemoveAll(tempDir)
		wasmFile := filepath.Join(tempDir, "main.wasm")
		cmd := exec.CommandContext(req.Context(), "go", "build", "-o", wasmFile, "./frontend")
		env := osutil.Environ(os.Environ())
		env.Set("GOOS", "js")
		env.Set("GOARCH", "wasm")
		cmd.Env = env
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err = cmd.Run()
		if err != nil {
			return err
		}
		w.Header().Set("Content-Type", "application/wasm")
		return serveFile(w, req, wasmFile)
	case strings.HasPrefix(req.URL.Path, "/-/api/gomod/"):
		p := req.URL.Path[len("/-/api/gomod/"):]
		resp, err := ctxhttp.Get(req.Context(), nil, h.proxy.ResolveReference(&url.URL{Path: p}).String())
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return os.ErrNotExist
		} else if resp.StatusCode != http.StatusOK {
			body, _ := ioutil.ReadAll(resp.Body)
			return fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
		}
		_, err = io.Copy(w, resp.Body)
		return err
	case req.URL.Path == "/-/api/dot":
		if req.Method != http.MethodPost {
			return httperror.Method{Allowed: []string{http.MethodPost}}
		}
		cmd := exec.CommandContext(req.Context(), "dot", "-Tsvg")
		cmd.Stdin = req.Body
		svg, err := cmd.Output()
		if err != nil {
			return err
		}
		w.Write(svg)
		return nil
	case req.URL.Path == "/favicon.ico":
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return nil
	default:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		return serveFile(w, req, filepath.Join("_data", "index.html"))
	}
}

func serveFile(w http.ResponseWriter, req *http.Request, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return err
	}
	httpgzip.ServeContent(w, req, fi.Name(), fi.ModTime(), f)
	return nil
}
