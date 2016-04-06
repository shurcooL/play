package main

import (
	"fmt"
	"io"
	"log"
	"os"
	pathpkg "path"
	"syscall"

	"github.com/shurcooL/webdavfs/vfsutil"
	"golang.org/x/net/webdav"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	fs := Foo{webdav.NewMemFS()}

	f, err := fs.OpenFile("/foo/bar/baz.txt", os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	f.Close()

	/*f, err = fs.OpenFile("/foo/bar.txt", os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	f.Close()*/

	err = fs.RemoveAll("/foo/bar/baz.txt")
	if err != nil {
		return err
	}

	fis, err := vfsutil.ReadDir(fs, "/")
	if err != nil {
		return err
	}
	fmt.Printf("%v files in root:\n", len(fis))
	for _, fi := range fis {
		fmt.Printf("  %q\n", fi.Name())
	}

	return nil
}

type Foo struct {
	s webdav.FileSystem
}

func (fs Foo) Mkdir(name string, perm os.FileMode) error {
	return fs.s.Mkdir(name, perm)
}

func (fs Foo) OpenFile(name string, flag int, perm os.FileMode) (webdav.File, error) {
	f, err := fs.s.OpenFile(name, flag, perm)
	if err != nil && flag&os.O_CREATE == os.O_CREATE && os.IsNotExist(err) {
		err = MkdirAll(fs.s, pathpkg.Dir(name), 0755)
		if err != nil {
			return nil, err
		}
		f, err = fs.s.OpenFile(name, flag, perm)
	}
	return f, err
}

func (fs Foo) RemoveAll(name string) error {
	err := fs.s.RemoveAll(name)
	if err != nil {
		return err
	}
	RmdirAll(fs.s, pathpkg.Dir(name))
	return nil
}

func (fs Foo) Rename(oldName string, newName string) error {
	return fs.s.Rename(oldName, newName)
}

func (fs Foo) Stat(name string) (os.FileInfo, error) {
	return fs.s.Stat(name)
}

// MkdirAll creates a directory named path,
// along with any necessary parents, and returns nil,
// or else returns an error.
// The permission bits perm are used for all
// directories that MkdirAll creates.
// If path is already a directory, MkdirAll does nothing
// and returns nil.
func MkdirAll(fs webdav.FileSystem, path string, perm os.FileMode) error {
	// Fast path: if we can tell whether path is a directory or file, stop with success or error.
	dir, err := fs.Stat(path)
	if err == nil {
		if dir.IsDir() {
			return nil
		}
		return &os.PathError{Op: "mkdir", Path: path, Err: syscall.ENOTDIR}
	}

	// Slow path: make sure parent exists and then call Mkdir for path.
	i := len(path)
	for i > 0 && os.IsPathSeparator(path[i-1]) { // Skip trailing path separator.
		i--
	}

	j := i
	for j > 0 && !os.IsPathSeparator(path[j-1]) { // Scan backward over element.
		j--
	}

	if j > 1 {
		// Create parent
		err = MkdirAll(fs, path[0:j-1], perm)
		if err != nil {
			return err
		}
	}

	// Parent now exists; invoke Mkdir and use its result.
	err = fs.Mkdir(path, perm)
	if err != nil {
		// Handle arguments like "foo/." by
		// double-checking that directory doesn't exist.
		dir, err1 := fs.Stat(path)
		if err1 == nil && dir.IsDir() {
			return nil
		}
		return err
	}
	return nil
}

// RmdirAll removes empty directory at path and any parents it can.
func RmdirAll(fs webdav.FileSystem, path string) {
	path = pathpkg.Clean(path)

	for {
		empty, err := emptyDir(fs, path)
		if err != nil {
			return
		}
		if !empty {
			return
		}

		err = fs.RemoveAll(path)
		if err != nil {
			return
		}

		// Move to parent.
		dir := pathpkg.Dir(path)
		if len(dir) >= len(path) {
			return
		}
		path = dir
	}
}

func emptyDir(fs webdav.FileSystem, name string) (bool, error) {
	f, err := fs.OpenFile(name, os.O_RDONLY, 0)
	if err != nil {
		return false, err
	}
	defer f.Close()
	fis, err := f.Readdir(1)
	if err != nil && err != io.EOF {
		return false, err
	}
	return len(fis) == 0, nil
}
