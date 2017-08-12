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
	gogit "sourcegraph.com/sourcegraph/go-vcs/vcs/git"
	"sourcegraph.com/sourcegraph/go-vcs/vcs/gitcmd"

	"github.com/shurcooL/play/229/vcs/git"
)

func main() {
	const repo = "/tmp/try/vcs-store/git/https/go.googlesource.com/go"
	//const repo = "/home/dmitri/store/vcsstore/git/https/go.googlesource.com/go"
	//const dir = "/src/encoding"
	const dir = "/src/net/http"
	const tag = "go1.9rc2"

	{
		err := runDisk(dir)
		if err != nil {
			log.Fatalln(err)
		}
	}

	{
		gitcmd.SetModTime = true
		err := runGit(func(dir string) (vcs.Repository, error) { return gitcmd.Open(dir) }, repo, dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	{
		gitcmd.SetModTime = false
		err := runGit(func(dir string) (vcs.Repository, error) { return gitcmd.Open(dir) }, repo, dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	{
		err := runGit(func(dir string) (vcs.Repository, error) { return gogit.Open(dir) }, repo, dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	if false {
		err := runNewGit(repo, dir, tag)
		if err != nil {
			log.Fatalln(err)
		}
	}

	// Output:
	// net/http: read total: 8.861625ms   1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 6.591873992s 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 815.592838ms 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 1.608730649s 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e

	// net/http: read total: 10.297202ms 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 6.135850236s 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 814.003669ms 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e
	// net/http: read total: 100.391421ms 1.2 MB (1182569 bytes) 3fcc1476bde7246ce53e3fbc5a71cd9ec0e4cbead3a7ed941385f4dd2742dd7e

	// TIMING: /net/http: 343.475347ms
	// TIMING: /net/http: 12.187826555s
	// TIMING: /net/http: 1.289728148s
	// TIMING: /net/http: 497.956958ms

	// TIMING: /github.com/google/go-github/github: 10.356989166s
	// TIMING: /github.com/google/go-github/github: 2.967798226s
	// TIMING: /github.com/google/go-github/github: 688.446594ms
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

func runGit(open vcs.Opener, repo, dir, tag string) error {
	t := time.Now()
	r, err := open(repo)
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

func runNewGit(repo, dir, tag string) error {
	t := time.Now()
	r, err := git.Open(repo)
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
