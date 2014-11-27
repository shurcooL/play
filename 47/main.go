package main

import (
	"fmt"
	"io"
	"net/http"
	"os"

	"sourcegraph.com/sourcegraph/go-vcs/vcs"
)

func main() {
	const dir = "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/go"

	gitRepo, err := vcs.OpenGitRepository(dir)
	if err != nil {
		panic(err)
	}

	fs, err := gitRepo.FileSystem("master@{50}")
	if err != nil {
		panic(err)
	}

	var fs2 http.FileSystem
	switch 0 {
	case 0:
		fs2 = vcsFsToHttpFs{fs}
	case 1:
		fs2 = http.Dir(dir)
	}

	fs2 = debugFileSystem{fs2}

	panic(http.ListenAndServe(":8080", http.FileServer(fs2)))
}

// DEPRECATED: Use code.google.com/p/go.tools/godoc/vfs/httpfs instead.
type vcsFsToHttpFs struct {
	vcs.FileSystem
}

func (this vcsFsToHttpFs) Open(name string) (http.File, error) {
	name = "." + name
	//goon.Dump(name)

	f, err := this.FileSystem.Open(name)
	//goon.Dump(f, err)
	return &file{fs: this.FileSystem, path: name, ReadSeekCloser: f}, err
}

type file struct {
	fs   vcs.FileSystem
	path string
	vcs.ReadSeekCloser

	readDirOffset int
}

func (this *file) Readdir(count int) ([]os.FileInfo, error) {
	//goon.Dump("Readdir", this.path, count)

	fi, err := this.fs.ReadDir(this.path)

	if this.readDirOffset <= len(fi) {
		fi = fi[this.readDirOffset:]
	} else {
		fi = nil
	}
	this.readDirOffset += count

	if len(fi) > count {
		fi = fi[:count]
	}

	if count > 0 && len(fi) == 0 && err == nil {
		err = io.EOF
	}

	return fi, err
}

func (this *file) Close() error {
	this.readDirOffset = 0
	return this.ReadSeekCloser.Close()
}

func (this *file) Stat() (os.FileInfo, error) {
	//goon.Dump("Stat", this.path)

	return this.fs.Stat(this.path)
}

// ---

type debugFileSystem struct {
	http.FileSystem
}

func (this debugFileSystem) Open(name string) (http.File, error) {
	fmt.Printf("debugFileSystem.Open(name: %s)\n", name)
	file, err := this.FileSystem.Open(name)
	fmt.Printf("	returning file: %v, err: %v\n", file, err)
	return debugFile{name: name, File: file}, err
}

type debugFile struct {
	name string
	http.File
}

func (this debugFile) Close() error {
	fmt.Printf("%s: debug.File.Close()\n", this.name)
	err := this.File.Close()
	fmt.Printf("	returning %v\n", err)
	return err
}

func (this debugFile) Read(p []byte) (n int, err error) {
	fmt.Printf("%s: debug.File.Read(len(p): %v)\n", this.name, len(p))
	n, err = this.File.Read(p)
	fmt.Printf("	returning n: %v, err: %v\n", n, err)
	return
}

func (this debugFile) Readdir(count int) ([]os.FileInfo, error) {
	fmt.Printf("%s: debug.File.Readdir(%v)\n", this.name, count)
	fi, err := this.File.Readdir(count)
	fmt.Printf("	returning len(fi): %v, err: %v\n", len(fi), err)
	return fi, err
}

func (this debugFile) Seek(offset int64, whence int) (int64, error) {
	fmt.Printf("%s: debug.File.Seek(%v, %v)\n", this.name, offset, whence)
	return this.File.Seek(offset, whence)
}

func (this debugFile) Stat() (os.FileInfo, error) {
	fmt.Printf("%s: debug.File.Stat()\n", this.name)
	fi, err := this.File.Stat()
	fmt.Printf("	returning fi: %v, err: %v\n", fi, err)
	return fi, err
}
