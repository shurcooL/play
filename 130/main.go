// Play with basic walking a vfs.
package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/httpfs/vfsutil"
	"github.com/shurcooL/httpgzip"
)

// File implements http.FileSystem using the native file system restricted to a
// specific file served at root.
//
// While the FileSystem.Open method takes '/'-separated paths, a File's string
// value is a filename on the native file system, not a URL, so it is separated
// by filepath.Separator, which isn't necessarily '/'.
type File string

func (f File) Open(name string) (http.File, error) {
	if name != "/" {
		return nil, errors.New(fmt.Sprintf("not found: %v", name))
	}
	return os.Open(string(f))
}

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

	fs := File("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/gtdo/assets/script/script.go")

	err := vfsutil.Walk(fs, "/", walkFn)
	if err != nil {
		panic(err)
	}

	f, err := fs.Open("/")
	fmt.Println(err)
	fi, err := f.Stat()
	fmt.Println(err)
	fmt.Println(fi.Size())
	f.Close()
	return

	log.Fatalln(http.ListenAndServe(":8080", httpgzip.FileServer(fs, httpgzip.FileServerOptions{ServeError: httpgzip.Detailed})))
}
