package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/shurcooL/go/vfs/godocfs/vfsutil"
	"golang.org/x/tools/godoc/vfs"
)

func main() {
	const root = "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/Go-Package-Store/assets/"

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
		fmt.Println(path)
		return nil
	}

	err := filepath.Walk(root, walkFn)
	if err != nil {
		panic(err)
	}

	fmt.Println("---")

	fs := vfs.OS("")

	err = vfsutil.Walk(fs, root, walkFn)
	if err != nil {
		panic(err)
	}

	//panic(http.ListenAndServe(":8080", raw_file_server.New(fs)))
}
