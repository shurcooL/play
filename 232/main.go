// Play with git server over HTTPS protocol.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/shurcooL/httperror"
)

func main() {
	flag.Parse()

	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	const addr = ":8080"
	fmt.Printf("listening on %q\n", addr)
	return http.ListenAndServe(addr, &handler{Dir: "/Users/Dmitri/Desktop/trygit"})
	//return http.ListenAndServe(addr, ghReverseProxy{})
}

type handler struct {
	Dir string
}

func (h *handler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	fmt.Println(req.Method, req.URL)
	switch url := req.URL.String(); {
	case strings.HasSuffix(url, "/info/refs?service=git-upload-pack"):
		if req.Method != http.MethodGet {
			httperror.HandleMethod(w, httperror.Method{Allowed: []string{http.MethodGet}})
			return
		}
		repo := url[:len(url)-len("/info/refs?service=git-upload-pack")]
		cmd := exec.CommandContext(req.Context(), "git-upload-pack", "--strict", "--advertise-refs", ".") // TODO: Abs path for binary.
		cmd.Dir = filepath.Join(h.Dir, filepath.FromSlash(repo))
		var buf bytes.Buffer
		cmd.Stdout = &buf
		err := cmd.Start()
		if os.IsNotExist(err) {
			http.Error(w, "Not found.", http.StatusNotFound)
			return
		} else if err != nil {
			http.Error(w, fmt.Errorf("could not start command: %v", err).Error(), http.StatusInternalServerError)
			return
		}
		err = cmd.Wait()
		if err != nil {
			log.Printf("git-upload-pack command failed: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/x-git-upload-pack-advertisement")
		_, err = io.WriteString(w, "001e# service=git-upload-pack\n0000")
		if err != nil {
			log.Println(err)
			return
		}
		_, err = io.Copy(w, &buf)
		if err != nil {
			log.Println(err)
		}
	case strings.HasSuffix(url, "/git-upload-pack"):
		if req.Method != http.MethodPost {
			httperror.HandleMethod(w, httperror.Method{Allowed: []string{http.MethodPost}})
			return
		}
		if req.Header.Get("Content-Type") != "application/x-git-upload-pack-request" {
			err := fmt.Errorf("unexpected Content-Type: %v", req.Header.Get("Content-Type"))
			httperror.HandleBadRequest(w, httperror.BadRequest{Err: err})
			return
		}
		repo := url[:len(url)-len("/git-upload-pack")]
		cmd := exec.CommandContext(req.Context(), "git-upload-pack", "--strict", "--stateless-rpc", ".") // TODO: Abs path for binary.
		cmd.Dir = filepath.Join(h.Dir, filepath.FromSlash(repo))
		cmd.Stdin = io.TeeReader(req.Body, os.Stdout)
		var buf bytes.Buffer
		cmd.Stdout = &buf
		err := cmd.Start()
		if os.IsNotExist(err) {
			http.Error(w, "Not found.", http.StatusNotFound)
			return
		} else if err != nil {
			http.Error(w, fmt.Errorf("could not start command: %v", err).Error(), http.StatusInternalServerError)
			return
		}
		err = cmd.Wait()
		if ee, _ := err.(*exec.ExitError); ee != nil && ee.Sys().(syscall.WaitStatus).ExitStatus() == 128 {
			// Supposedly this is "fatal: The remote end hung up unexpectedly"
			// due to git clone --depth=1 or so. Do nothing.
			//fmt.Printf("\ngit-upload-pack command failed: %v\n", err)
		} else if err != nil {
			log.Printf("git-upload-pack command failed: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/x-git-upload-pack-result")
		_, err = io.Copy(w, &buf)
		if err != nil {
			log.Println(err)
		}
	default:
		http.Error(w, "Not found.", http.StatusNotFound)
	}
}

type ghReverseProxy struct{}

func (ghReverseProxy) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	defer fmt.Print("\n\n---\n\n")
	dump, err := httputil.DumpRequest(req, true)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(dump)
	if !bytes.HasSuffix(dump, []byte("\n")) {
		fmt.Println("")
	}
	fmt.Println("->")
	//req.Host = "github.com"
	rr := httptest.NewRecorder()
	//httputil.NewSingleHostReverseProxy(&url.URL{Scheme: "https", Host: "github.com"}).ServeHTTP(rr, req)
	(&handler{Dir: "/Users/Dmitri/Desktop/trygit"}).ServeHTTP(rr, req)
	dump, err = httputil.DumpResponse(rr.Result(), true)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(dump)
	for k, v := range rr.HeaderMap {
		w.Header()[k] = v
	}
	w.WriteHeader(rr.Code)
	io.Copy(w, rr.Body)
}
