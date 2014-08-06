package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/shurcooL/go-goon"
	. "github.com/shurcooL/go/gists/gist4737109"
	. "github.com/shurcooL/go/gists/gist5286084"
)

// ---

type FlushWriter struct {
	w io.Writer
	f http.Flusher
}

func (fw *FlushWriter) Write(p []byte) (n int, err error) {
	defer fw.f.Flush()
	return fw.w.Write(p)
}

// ---

func debugHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Hi.")
}

func handler(w http.ResponseWriter, r *http.Request) {
	requestPath := strings.Split(r.URL.Path, "/")

	const gistIdSuffix = ".git"
	if len(requestPath) == 3 && strings.HasSuffix(requestPath[2], gistIdSuffix) {
		w.Header().Set("Content-Type", "text/plain; charset=us-ascii")
		w.Header().Set("X-Content-Type-Options", "nosniff")

		gistId := requestPath[2][:len(requestPath[2])-len(gistIdSuffix)]

		if username, err := GistIdToUsername(gistId); err == nil && username == "shurcooL" {
			cmd := exec.Command("go", "get", "-u", "gist.github.com/"+gistId+gistIdSuffix)
			//cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "GOPATH=/root/GoAuto"}
			out, err := cmd.CombinedOutput()
			if err != nil {
				fmt.Fprintln(w, string(out))
				return
			}

			cmd = exec.Command("/root/GoAuto/bin/" + gistId + gistIdSuffix)
			cmd.Stdout = &FlushWriter{w: w, f: w.(http.Flusher)}
			cmd.Stderr = cmd.Stdout
			err = cmd.Run()
			CheckError(err)
		} else {
			fmt.Fprintln(w, "Untrusted user.")
			fmt.Fprint(w, goon.SdumpExpr(username, err))
		}
	}
}

var httpAddrFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")

func main() {
	flag.Parse()
	runtime.GOMAXPROCS(runtime.NumCPU())

	err := os.Setenv("GOPATH", "/root/GoAuto")
	CheckError(err)

	http.HandleFunc("/debug", debugHandler)
	http.HandleFunc("/gist.github.com/", handler)

	err = http.ListenAndServe(*httpAddrFlag, nil)
	CheckError(err)
}
