package main

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"syscall"

	"github.com/shurcooL/go-goon"
)

func main() {
	tempDir, err := ioutil.TempDir("", "osxrmtry_")
	if err != nil {
		log.Panicln(err)
	}

	goon.DumpExpr(tempDir)

	tempFile := filepath.Join(tempDir, "gen.txt")
	err = ioutil.WriteFile(tempFile, []byte("hello"), 0600)
	if err != nil {
		log.Panicln(err)
	}

	err = RemoveAll(tempDir)
	if err != nil {
		fmt.Fprintln(os.Stdout, "warning: error removing temp dir:", err)
	}
}

// RemoveAll removes path and any children it contains.
// It removes everything it can but returns the first error
// it encounters.  If the path does not exist, RemoveAll
// returns nil (no error).
func RemoveAll(path string) error {
	goon.DumpExpr("RemoveAll", path)

	// Simple case: if Remove works, we're done.
	err := os.Remove(path)
	if err == nil {
		fmt.Println("Simple case")
		return nil
	}

	// Otherwise, is this a directory we need to recurse into?
	dir, serr := os.Lstat(path)
	if serr != nil {
		if serr, ok := serr.(*os.PathError); ok && (os.IsNotExist(serr.Err) || serr.Err == syscall.ENOTDIR) {
			return nil
		}
		return serr
	}
	if !dir.IsDir() {
		// Not a directory; return the error from Remove.
		return err
	}

	// Directory.
	fd, err := os.Open(path)
	if err != nil {
		return err
	}

	// Remove contents & return first error.
	err = nil
	for {
		names, err1 := fd.Readdirnames(100)
		for _, name := range names {
			err1 := RemoveAll(path + string(os.PathSeparator) + name)
			if err == nil {
				err = err1
			}
		}
		if err1 == io.EOF {
			break
		}
		// If Readdirnames returned an error, use it.
		if err == nil {
			err = err1
		}
		if len(names) == 0 {
			break
		}
	}

	// Close directory, because windows won't remove opened directory.
	fd.Close()

	// Remove directory.
	err1 := os.Remove(path)
	if err == nil {
		err = err1
	}
	return err
}
