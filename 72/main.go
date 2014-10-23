package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"code.google.com/p/go.tools/godoc/vfs"
	"github.com/shurcooL/go/vfs_util"
)

func main() {
	var out string
	walkFn := func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			log.Printf("can't stat file %s: %v\n", path, err)
			return nil
		}
		if strings.HasPrefix(fi.Name(), ".") {
			if fi.IsDir() {
				return filepath.SkipDir
			} else {
				return nil
			}
		}
		out += fmt.Sprintln(path)
		return nil
	}

	fs := vfs.OS("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/Go-Package-Store/assets/")

	fs = vfs_util.NewPrefixFS(fs, "/home/prefix/foo/bar/gzz")

	fs = vfs_util.NewDebugFS(fs)

	err := vfs_util.Walk(fs, "/", walkFn)
	if err != nil {
		panic(err)
	}

	fmt.Print("---\n" + out)

	//panic(http.ListenAndServe(":8080", raw_file_server.New(fs)))
}
