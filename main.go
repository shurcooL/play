package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"

	. "gist.github.com/4737109.git"
	. "gist.github.com/5286084.git"
	"github.com/shurcooL/go-goon"
)

func debugHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, os.Getenv("GOPATH"))
}

func handler(w http.ResponseWriter, r *http.Request) {
	requestPath := strings.Split(r.URL.Path, "/")

	const gistIdSuffix = ".git"
	if len(requestPath) == 3 && strings.HasSuffix(requestPath[2], gistIdSuffix) {
		gistId := requestPath[2][:len(requestPath[2])-len(gistIdSuffix)]

		if username, err := GistIdToUsername(gistId); err == nil && username == "shurcooL" {
			cmd := exec.Command("go", "get", "-u", "gist.github.com/"+gistId+gistIdSuffix)
			//cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "GOPATH=/root/GoAuto"}
			err := cmd.Run()
			CheckError(err)

			cmd = exec.Command("/root/GoAuto/bin/" + gistId + gistIdSuffix)
			out, err := cmd.CombinedOutput()
			CheckError(err)
			fmt.Fprintln(w, string(out))
		} else {
			fmt.Fprintln(w, "Untrusted user.")
			fmt.Fprint(w, goon.SdumpExpr(username, err))
		}
	}
}

func main() {
	err := os.Setenv("GOPATH", "/root/GoAuto")
	CheckError(err)

	http.HandleFunc("/debug", debugHandler)
	http.HandleFunc("/gist.github.com/", handler)

	err = http.ListenAndServe(":8080", nil)
	CheckError(err)
}
