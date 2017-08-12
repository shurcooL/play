package git

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	pathpkg "path"
	"strconv"
	"strings"
	"time"

	"github.com/shurcooL/go/osutil"
	"github.com/shurcooL/play/229/vcs"
)

func Open(dir string) (vcs.Repository, error) {
	return repo{
		root: dir,
	}, nil
}

type repo struct {
	root string // Root directory.
}

func (r repo) FileSystem(commitID string) (http.FileSystem, error) {
	return fileSystem{
		root:     r.root,
		commitID: commitID,
	}, nil
}

type fileSystem struct {
	root     string
	commitID string
}

func (fs fileSystem) Open(path string) (http.File, error) {
	path = pathpkg.Clean("/" + path)[1:] // Clean, turn absolute to relative.

	cmd := exec.Command("git", "ls-tree", "-z", "--full-tree", "--long", fs.commitID, "--", path)
	cmd.Dir = fs.root
	env := osutil.Environ(os.Environ())
	env.Set("LANG", "en_US.UTF-8")
	cmd.Env = env

	//t := time.Now()
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git.fileSystem.Open: %v: %v", strings.Join(cmd.Args, " "), err)
	}
	//fmt.Println("ls-treeing:", time.Since(t))

	idx := bytes.IndexByte(out, '\x00')
	if idx == -1 {
		return nil, fmt.Errorf("git.fileSystem.Open: %v: line %q is not null-terminated", strings.Join(cmd.Args, " "), out)
	}

	line, err := parseLsTreeLine(string(out[:idx]))
	if err != nil {
		return nil, fmt.Errorf("git.fileSystem.Open: %v: %v", strings.Join(cmd.Args, " "), err)
	}

	switch line.typ {
	case "blob":
		cmd := exec.Command("git", "cat-file", "blob", line.object)
		cmd.Dir = fs.root
		env := osutil.Environ(os.Environ())
		env.Set("LANG", "en_US.UTF-8")
		cmd.Env = env

		//t := time.Now()
		out, err := cmd.Output()
		if err != nil {
			return nil, fmt.Errorf("git.fileSystem.Open: %v: %v", strings.Join(cmd.Args, " "), err)
		}
		//fmt.Println("cat-filing:", time.Since(t))

		return file{
			fs:   fs,
			path: path,
			r:    bytes.NewReader(out),
		}, nil
	case "tree":
		return dir{
			fs:   fs,
			path: path,
		}, nil
	default:
		return nil, os.ErrNotExist
	}
}

// file is a file.
type file struct {
	fs   fileSystem
	path string // Clean relative path.

	r io.Reader
}

func (file) Close() error                       { return nil }
func (f file) Read(p []byte) (n int, err error) { return f.r.Read(p) }
func (file) Seek(offset int64, whence int) (int64, error) {
	return 0, errors.New("Seek: not implemented")
}
func (f file) Readdir(count int) ([]os.FileInfo, error) {
	return nil, fmt.Errorf("cannot Readdir from file %s", f.path)
}
func (file) Stat() (os.FileInfo, error) { return nil, errors.New("Stat: not implemented") }

// dir is a dir.
type dir struct {
	fs   fileSystem
	path string // Clean relative path.
}

func (dir) Close() error { return nil }
func (d dir) Read([]byte) (int, error) {
	return 0, fmt.Errorf("cannot Read from directory %s", d.path)
}
func (dir) Seek(offset int64, whence int) (int64, error) {
	return 0, errors.New("Seek: not implemented")
}
func (dir) Stat() (os.FileInfo, error) { return nil, errors.New("Stat: not implemented") }

func (d dir) Readdir(count int) ([]os.FileInfo, error) {
	cmd := exec.Command("git", "ls-tree", "-z", "--full-tree", "--long", d.fs.commitID, "--", d.path+"/")
	cmd.Dir = d.fs.root
	env := osutil.Environ(os.Environ())
	env.Set("LANG", "en_US.UTF-8")
	cmd.Env = env

	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	lines := bytes.Split(out, []byte{'\x00'})
	fis := make([]os.FileInfo, len(lines)-1)
	for i, line := range lines {
		if i == len(lines)-1 {
			// last entry is empty
			continue
		}

		// Format of `git ls-tree --long` is:
		// "MODE TYPE COMMITID      SIZE    NAME"
		// For example:
		// "100644 blob cfea37f3df073e40c52b61efcd8f94af750346c7     73   mydir/myfile"
		parts := bytes.SplitN(line, []byte(" "), 4)
		if len(parts) != 4 {
			return nil, fmt.Errorf("invalid `git ls-tree --long` output: %q", out)
		}

		typ := string(parts[1])
		oid := parts[2]
		if len(oid) != 40 {
			return nil, fmt.Errorf("invalid `git ls-tree --long` oid output: %q", oid)
		}

		rest := bytes.TrimLeft(parts[3], " ")
		restParts := bytes.SplitN(rest, []byte{'\t'}, 2)
		if len(restParts) != 2 {
			return nil, fmt.Errorf("invalid `git ls-tree --long` size and/or name: %q", rest)
		}
		sizeB := restParts[0]
		var size int64
		if len(sizeB) != 0 && sizeB[0] != '-' {
			size, err = strconv.ParseInt(string(sizeB), 10, 64)
			if err != nil {
				return nil, err
			}
		}
		name := pathpkg.Base(string(restParts[1]))

		switch typ {
		case "blob":
			// Regular file.
			fis[i] = &vfsgen۰FileInfo{
				name: name,
				size: size,
			}
		case "tree":
			// Directory.
			fis[i] = &vfsgen۰DirInfo{
				name: name,
			}
		}
	}
	return fis, nil
}

// vfsgen۰FileInfo is a static definition of an uncompressed file (because it's not worth gzip compressing).
type vfsgen۰FileInfo struct {
	name string
	size int64
}

func (f *vfsgen۰FileInfo) Readdir(count int) ([]os.FileInfo, error) {
	return nil, fmt.Errorf("cannot Readdir from file %s", f.name)
}
func (f *vfsgen۰FileInfo) Stat() (os.FileInfo, error) { return f, nil }

func (f *vfsgen۰FileInfo) Name() string       { return f.name }
func (f *vfsgen۰FileInfo) Size() int64        { return f.size }
func (_ *vfsgen۰FileInfo) Mode() os.FileMode  { return 0444 }
func (_ *vfsgen۰FileInfo) ModTime() time.Time { return time.Time{} }
func (_ *vfsgen۰FileInfo) IsDir() bool        { return false }
func (_ *vfsgen۰FileInfo) Sys() interface{}   { return nil }

// vfsgen۰File is an opened file instance.
type vfsgen۰File struct {
	*vfsgen۰FileInfo
	*bytes.Reader
}

func (f *vfsgen۰File) Close() error {
	return nil
}

// vfsgen۰DirInfo is a static definition of a directory.
type vfsgen۰DirInfo struct {
	name    string
	entries []os.FileInfo
}

func (d *vfsgen۰DirInfo) Read([]byte) (int, error) {
	return 0, fmt.Errorf("cannot Read from directory %s", d.name)
}
func (_ *vfsgen۰DirInfo) Close() error               { return nil }
func (d *vfsgen۰DirInfo) Stat() (os.FileInfo, error) { return d, nil }

func (d *vfsgen۰DirInfo) Name() string       { return d.name }
func (_ *vfsgen۰DirInfo) Size() int64        { return 0 }
func (_ *vfsgen۰DirInfo) Mode() os.FileMode  { return 0755 | os.ModeDir }
func (_ *vfsgen۰DirInfo) ModTime() time.Time { return time.Time{} }
func (_ *vfsgen۰DirInfo) IsDir() bool        { return true }
func (_ *vfsgen۰DirInfo) Sys() interface{}   { return nil }

// vfsgen۰Dir is an opened dir instance.
type vfsgen۰Dir struct {
	*vfsgen۰DirInfo
	pos int // Position within entries for Seek and Readdir.
}

func (d *vfsgen۰Dir) Seek(offset int64, whence int) (int64, error) {
	if offset == 0 && whence == io.SeekStart {
		d.pos = 0
		return 0, nil
	}
	return 0, fmt.Errorf("unsupported Seek in directory %s", d.name)
}

func (d *vfsgen۰Dir) Readdir(count int) ([]os.FileInfo, error) {
	if d.pos >= len(d.entries) && count > 0 {
		return nil, io.EOF
	}
	if count <= 0 || count > len(d.entries)-d.pos {
		count = len(d.entries) - d.pos
	}
	e := d.entries[d.pos : d.pos+count]
	d.pos += count
	return e, nil
}
