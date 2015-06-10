// Play with rwvfs.Union.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/go/raw_file_server"
	"github.com/shurcooL/go/vfs/godocfs/vfsutil"
	"sourcegraph.com/sourcegraph/rwvfs"
)

func main() {
	walkFn := func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			log.Printf("can't stat file %s: %v\n", path, err)
			return nil
		}
		switch fi.IsDir() {
		case false:
			fmt.Println(path)
		case true:
			fmt.Println(path + "/ (dir)")
		}
		return nil
	}

	fs0 := rwvfs.Map(map[string]string{
		"sample-file.txt":                "This file compresses well. Blaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaah!",
		"not-worth-compressing-file.txt": "Its normal contents are here.",
		"folderA/file1.txt":              "Stuff.",
		"folderA/file2.txt":              "Stuff.",
		"folderA/file-important-A.go":    "Some go file.",
		"folderB/folderC/file3.txt":      "Stuff.",
		//"folder-empty/":                  "",
	})

	fs1 := rwvfs.Map(map[string]string{
		"some-other-folder/stuff.txt": "Diff filesystem.",
		"folderA/file3.txt":           "Also diff filesystem.",
		"folderA/file-important-B.go": "Some other go file.",
		"folderB/folderC/file4.txt":   "Other stuff.",
		"folderB/file5.txt":           "Other stuff.",
	})

	fs := rwvfs.Union(fs0, fs1)

	err := vfsutil.Walk(fs, "/", walkFn)
	if err != nil {
		panic(err)
	}

	panic(http.ListenAndServe(":8080", raw_file_server.New(fs)))
}
