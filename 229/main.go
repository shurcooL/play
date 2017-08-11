package main

import (
	"crypto/sha256"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"time"

	"github.com/dustin/go-humanize"

	"sourcegraph.com/sourcegraph/go-vcs/vcs"
	"sourcegraph.com/sourcegraph/go-vcs/vcs/gitcmd"

	"github.com/shurcooL/play/229/vcs/git"
)

func main() {
	const dir = "/src/net/http"
	//const dir = "/src/encoding"

	{
		err := runDisk(dir)
		if err != nil {
			log.Fatalln(err)
		}
	}
	// net/http: read total: 16.042893ms 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e

	if false {
		gitcmd.SetModTime = true
		err := runGit(dir)
		if err != nil {
			log.Fatalln(err)
		}
	}
	// net/http: read total: 10.837731283s 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e

	if false {
		gitcmd.SetModTime = false
		err := runGit(dir)
		if err != nil {
			log.Fatalln(err)
		}
	}
	// read total: 2.885154088s 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e

	{
		err := runNewGit(dir)
		if err != nil {
			log.Fatalln(err)
		}
	}
	// net/http: ?
}

func runDisk(dir string) error {
	t := time.Now()
	fs := http.Dir("/usr/local/go")
	f, err := fs.Open(dir)
	if err != nil {
		return err
	}
	defer func() {
		err := f.Close()
		if err != nil {
			log.Println(err)
		}
	}()
	fis, err := f.Readdir(0)
	if err != nil {
		return err
	}
	var (
		total uint64 // Bytes.
		h     = sha256.New()
	)
	for _, fi := range fis {
		if fi.IsDir() {
			continue
		}
		f, err := fs.Open(path.Join(dir, fi.Name()))
		if err != nil {
			return err
		}
		n, err := io.Copy(h, f)
		if err != nil {
			f.Close()
			return err
		}
		err = f.Close()
		if err != nil {
			return err
		}
		total += uint64(n)
	}
	fmt.Printf("%v: read total: %v %v (%v bytes) %x\n", dir[5:], time.Since(t), humanize.Bytes(total), total, h.Sum(nil))
	return nil
}

func runGit(dir string) error {
	t := time.Now()
	r, err := vcs.Open("git", "/tmp/try/vcs-store/git/https/go.googlesource.com/go")
	if err != nil {
		return err
	}
	fs, err := r.FileSystem("go1.9rc2")
	if err != nil {
		return err
	}
	fis, err := fs.ReadDir(dir)
	if err != nil {
		return err
	}
	var (
		total uint64 // Bytes.
		h     = sha256.New()
	)
	for _, fi := range fis {
		if fi.IsDir() {
			continue
		}
		f, err := fs.Open(path.Join(dir, fi.Name()))
		if err != nil {
			return err
		}
		n, err := io.Copy(h, f)
		if err != nil {
			f.Close()
			return err
		}
		err = f.Close()
		if err != nil {
			return err
		}
		total += uint64(n)
	}
	fmt.Printf("%v: read total: %v %v (%v bytes) %x\n", dir[5:], time.Since(t), humanize.Bytes(total), total, h.Sum(nil))
	return nil
}

func runNewGit(dir string) error {
	t := time.Now()
	r, err := git.Open("/tmp/try/vcs-store/git/https/go.googlesource.com/go")
	if err != nil {
		return err
	}
	fs, err := r.FileSystem("go1.9rc2")
	if err != nil {
		return err
	}
	f, err := fs.Open(dir)
	if err != nil {
		return err
	}
	defer func() {
		err := f.Close()
		if err != nil {
			log.Println(err)
		}
	}()
	fis, err := f.Readdir(0)
	if err != nil {
		return err
	}
	var (
		total uint64 // Bytes.
		h     = sha256.New()
	)
	for _, fi := range fis {
		if fi.IsDir() {
			continue
		}
		f, err := fs.Open(path.Join(dir, fi.Name()))
		if err != nil {
			return err
		}
		n, err := io.Copy(h, f)
		if err != nil {
			f.Close()
			return err
		}
		err = f.Close()
		if err != nil {
			return err
		}
		total += uint64(n)
	}
	fmt.Printf("%v: read total: %v %v (%v bytes) %x\n", dir[5:], time.Since(t), humanize.Bytes(total), total, h.Sum(nil))
	return nil
}
