// Play with basic walking a vfs.
package main

import (
	"fmt"
	"log"
	"os"

	"github.com/shurcooL/go/vfs/godocfs/vfsutil"
	"golang.org/x/tools/godoc/vfs/mapfs"
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

	fs := mapfs.New(map[string]string{
		"sample-file.txt":                "This file compresses well. Blaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaah!",
		"not-worth-compressing-file.txt": "Its normal contents are here.",
		"folderA/file1.txt":              "Stuff.",
		"folderA/file2.txt":              "Stuff.",
		"folderB/folderC/file3.txt":      "Stuff.",
		"folder-empty/":                  "",
	})

	err := vfsutil.Walk(fs, "/", walkFn)
	if err != nil {
		panic(err)
	}

	//panic(http.ListenAndServe(":8080", raw_file_server.New(fs)))
}
