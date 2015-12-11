// Experiment in running gist commands and streaming output via HTTP.
package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"

	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/gists/gist4737109"
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

func handler(w http.ResponseWriter, r *http.Request) {
	elements := strings.Split(r.URL.Path, "/")

	const gistIdSuffix = ".git"
	if len(elements) == 3 && strings.HasSuffix(elements[2], gistIdSuffix) {
		w.Header().Set("Content-Type", "text/plain; charset=us-ascii")
		w.Header().Set("X-Content-Type-Options", "nosniff")

		gistId := elements[2][:len(elements[2])-len(gistIdSuffix)]

		if username, err := gist4737109.GistIdToUsername(gistId); err == nil && username == "shurcooL" {
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
			if err != nil {
				panic(err)
			}
		} else {
			fmt.Fprintln(w, "Untrusted user.")
			fmt.Fprint(w, goon.SdumpExpr(username, err))
		}
	}
}

var httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")

func main() {
	flag.Parse()

	err := os.Setenv("GOPATH", "/root/GoAuto")
	if err != nil {
		panic(err)
	}

	http.HandleFunc("/gist.github.com/", handler)

	err = http.ListenAndServe(*httpFlag, nil)
	if err != nil {
		panic(err)
	}
}
