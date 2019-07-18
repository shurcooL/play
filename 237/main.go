// Walk git repositories and list all Go packages inside.
package main

import (
	"fmt"
	"go/build"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/shurcooL/go/vfs/godocfs/vfsutil"
	"golang.org/x/tools/godoc/vfs"
	"sourcegraph.com/sourcegraph/go-vcs/vcs/git"
)

func main() {
	started := time.Now()
	err := walkRepositoryStore(filepath.Join(os.Getenv("HOME"), "Dropbox", "Store", "repositories"))
	if err != nil {
		log.Fatalln(err)
	}
	fmt.Println(time.Since(started))
}

func walkRepositoryStore(root string) error {
	err := filepath.Walk(root, func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			log.Printf("can't stat file %s: %v\n", path, err)
			return nil
		}
		if !fi.IsDir() {
			return nil
		}
		if strings.HasPrefix(fi.Name(), ".") || strings.HasPrefix(fi.Name(), "_") || fi.Name() == "testdata" {
			return filepath.SkipDir
		}
		ok, err := isBareGitRepository(path)
		if err != nil {
			log.Println(err)
			return nil
		} else if !ok {
			return nil
		}
		err = walkRepository(path[len(root)+1:], path)
		if err != nil {
			return err
		}
		return filepath.SkipDir
	})
	return err
}

// isBareGitRepository reports whether there is a bare git repository at dir.
// dir must point to an existing directory.
func isBareGitRepository(dir string) (bool, error) {
	head, err := os.Stat(filepath.Join(dir, "HEAD"))
	if os.IsNotExist(err) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	return !head.IsDir(), nil
}

func walkRepository(repoRoot, dir string) error {
	r, err := git.Open(dir)
	if err != nil {
		return err
	}
	head, err := r.ResolveRevision("HEAD")
	if err != nil {
		return err
	}
	fs, err := r.FileSystem(head)
	if err != nil {
		return err
	}
	err = vfsutil.Walk(fs, "/", func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			log.Printf("can't stat file %s: %v\n", path, err)
			return nil
		}
		if !fi.IsDir() {
			return nil
		}
		if strings.HasPrefix(fi.Name(), ".") || strings.HasPrefix(fi.Name(), "_") || fi.Name() == "testdata" {
			return filepath.SkipDir
		}
		err = loadPackage(repoRoot, fs, path)
		return err
	})
	return err
}

func loadPackage(repoRoot string, fs vfs.FileSystem, dir string) error {
	bctx := buildContext(fs)
	p, err := bctx.ImportDir(dir, 0)
	if err != nil {
		return err
	}
	fmt.Println(path.Join(repoRoot, dir), isCommand(p))
	fmt.Println(p.Doc)
	return nil
}

func buildContext(fs vfs.FileSystem) build.Context {
	return build.Context{
		GOOS:        "linux",
		GOARCH:      "amd64",
		GOROOT:      "",
		GOPATH:      "",
		CgoEnabled:  true,
		Compiler:    build.Default.Compiler,
		ReleaseTags: build.Default.ReleaseTags,
		JoinPath:    path.Join,
		IsAbsPath:   path.IsAbs,
		SplitPathList: func(list string) []string {
			//fmt.Printf("context.SplitPathList %q\n", list)
			return strings.Split(list, ":")
		},
		IsDir: func(path string) bool {
			//fmt.Printf("context.IsDir %q\n", path)
			fi, err := fs.Stat(path)
			return err == nil && fi.IsDir()
		},
		HasSubdir: func(root, dir string) (rel string, ok bool) {
			//fmt.Printf("context.HasSubdir %q %q\n", root, dir)
			root = path.Clean(root)
			if !strings.HasSuffix(root, "/") {
				root += "/"
			}
			dir = path.Clean(dir)
			if !strings.HasPrefix(dir, root) {
				return "", false
			}
			return dir[len(root):], true
		},
		ReadDir: func(dir string) ([]os.FileInfo, error) {
			//fmt.Printf("context.ReadDir %q\n", dir)
			return fs.ReadDir(dir)
		},
		OpenFile: func(path string) (io.ReadCloser, error) {
			//fmt.Printf("context.OpenFile %q\n", path)
			return fs.Open(path)
		},
	}
}

func isCommand(p *build.Package) string {
	if p.IsCommand() {
		return "(command)"
	}
	return "(library)"
}
