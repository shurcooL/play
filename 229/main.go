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

	gogit "github.com/shazow/go-vcs/vcs/git"

	"github.com/shurcooL/play/229/vcs/git"
)

func main() {
	const dir = "/src/net/http"
	//const dir = "/src/encoding"
	const tag = "go1.9rc2"

	{
		err := runDisk(dir)
		if err != nil {
			log.Fatalln(err)
		}
	}

	{
		gitcmd.SetModTime = true
		err := runGit(func(dir string) (vcs.Repository, error) { return gitcmd.Open(dir) }, dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	{
		gitcmd.SetModTime = false
		err := runGit(func(dir string) (vcs.Repository, error) { return gitcmd.Open(dir) }, dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	{
		err := runGit(func(dir string) (vcs.Repository, error) { return gogit.Open(dir) }, dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	if false {
		err := runNewGit(dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	// Output:
	// net/http: read total: 8.861625ms   1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 6.591873992s 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 815.592838ms 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 1.608730649s 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
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

func runGit(open vcs.Opener, dir, tag string) error {
	t := time.Now()
	r, err := open("/tmp/try/vcs-store/git/https/go.googlesource.com/go")
	if err != nil {
		return err
	}
	fmt.Println("using:", r)
	commitID, err := r.ResolveTag(tag)
	if err != nil {
		return err
	}
	fmt.Println("resolved tag:", commitID)
	fs, err := r.FileSystem(commitID)
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

func runNewGit(dir, tag string) error {
	t := time.Now()
	r, err := git.Open("/tmp/try/vcs-store/git/https/go.googlesource.com/go")
	if err != nil {
		return err
	}
	fs, err := r.FileSystem(tag)
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
