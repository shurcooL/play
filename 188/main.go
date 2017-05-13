// Play with a VFS abstraction that implicitly creates/removes directories.
package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	pathpkg "path"

	"github.com/shurcooL/webdavfs/vfsutil"
	"golang.org/x/net/webdav"
)

func run() error {
	fs := ImplicitDirFS{webdav.NewMemFS()}

	f, err := fs.OpenFile("/foo/bar/baz.txt", os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	f.Close()

	f, err = fs.OpenFile("/foo/bar.txt", os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	f.Close()

	err = Tree(fs, "/")
	if err != nil {
		return err
	}

	fmt.Println("\n---\n")

	err = fs.RemoveAll("/foo/bar/baz.txt")
	if err != nil {
		return err
	}

	err = Tree(fs, "/")
	if err != nil {
		return err
	}

	fmt.Println("\n---\n")

	err = fs.RemoveAll("/foo/bar.txt")
	if err != nil {
		return err
	}

	err = Tree(fs, "/")
	if err != nil {
		return err
	}

	return nil
}

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

// ImplicitDirFS is a virtual filesystem wrapper that implicitly creates/removes directories.
type ImplicitDirFS struct {
	fs webdav.FileSystem
}

// Mkdir does not make sense.
/*func (id ImplicitDirFS) Mkdir(name string, perm os.FileMode) error {
	return id.fs.Mkdir(name, perm)
}*/

func (id ImplicitDirFS) OpenFile(name string, flag int, perm os.FileMode) (webdav.File, error) {
	f, err := id.fs.OpenFile(context.Background(), name, flag, perm)
	if os.IsNotExist(err) && flag&os.O_CREATE == os.O_CREATE {
		err = vfsutil.MkdirAll(context.Background(), id.fs, pathpkg.Dir(name), 0755)
		if err != nil {
			return nil, err
		}
		f, err = id.fs.OpenFile(context.Background(), name, flag, perm)
	}
	return f, err
}

func (id ImplicitDirFS) RemoveAll(name string) error {
	err := id.fs.RemoveAll(context.Background(), name)
	if err != nil {
		return err
	}
	rmdirAll(id.fs, pathpkg.Dir(name))
	return nil
}

func (id ImplicitDirFS) Rename(oldName string, newName string) error {
	// TODO: Consider MkdirAll, rmdirAll implications, etc.?
	return id.fs.Rename(context.Background(), oldName, newName)
}

func (id ImplicitDirFS) Stat(name string) (os.FileInfo, error) {
	return id.fs.Stat(context.Background(), name)
}

// rmdirAll removes empty directory at path and any empty parents.
func rmdirAll(fs webdav.FileSystem, path string) {
	path = pathpkg.Clean(path)

	for {
		empty, err := emptyDir(fs, path)
		if err != nil {
			return
		}
		if !empty {
			return
		}

		err = fs.RemoveAll(context.Background(), path)
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

// emptyDir reports if name is an empty directory.
func emptyDir(fs webdav.FileSystem, name string) (bool, error) {
	f, err := fs.OpenFile(context.Background(), name, os.O_RDONLY, 0)
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

/*// rmdirAll removes empty directory at path and any empty parents.
func (id ImplicitDirFS) rmdirAll(path string) {
	path = pathpkg.Clean(path)

	for {
		empty, err := id.emptyDir(path)
		if err != nil {
			return
		}
		if !empty {
			return
		}

		err = id.fs.RemoveAll(path)
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

// emptyDir reports if name is an empty directory.
func (id ImplicitDirFS) emptyDir(name string) (bool, error) {
	f, err := id.fs.OpenFile(name, os.O_RDONLY, 0)
	if err != nil {
		return false, err
	}
	defer f.Close()
	fis, err := f.Readdir(1)
	if err != nil && err != io.EOF {
		return false, err
	}
	return len(fis) == 0, nil
}*/
