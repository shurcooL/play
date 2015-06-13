package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/shurcooL/go/vfs/godocfs/vfsutil"
	"sourcegraph.com/sourcegraph/go-vcs/vcs"
	_ "sourcegraph.com/sourcegraph/go-vcs/vcs/gitcmd"
	_ "sourcegraph.com/sourcegraph/go-vcs/vcs/hgcmd"
)

func main() {
	foo()
}

func foo() (interface{}, interface{}, error) {
	rev := ""

	repo, err := vcs.Open("git", "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/gopherjs/websocket/")
	if err != nil {
		return nil, nil, err
	}

	var commitId vcs.CommitID
	if rev != "" {
		commitId, err = repo.ResolveRevision(rev)
	} else {
		commitId, err = repo.ResolveBranch("master")
	}
	if err != nil {
		return nil, nil, err
	}

	fmt.Println(commitId)

	fs, err := repo.FileSystem(commitId)
	if err != nil {
		return nil, nil, err
	}

	_, err = fs.Open("/doc.go") // doesn't exist (now fixed)
	fmt.Println(err)
	_, err = fs.Open("doc.go") // works
	fmt.Println(err)

	_, err = fs.ReadDir("/") // doesn't exist (now fixed)
	fmt.Println(err)
	_, err = fs.ReadDir(".") // works
	fmt.Println(err)

	{
		walkFn := func(path string, fi os.FileInfo, err error) error {
			if err != nil {
				log.Printf("can't stat file %s: %v\n", path, err)
				return nil
			}
			if strings.HasPrefix(fi.Name(), ".") {
				if fi.IsDir() {
					return filepath.SkipDir
				} else {
					return nil
				}
			}
			fmt.Println(path)
			return nil
		}

		err = vfsutil.Walk(fs, "./", walkFn)
		if err != nil {
			panic(err)
		}
	}

	fmt.Println("all good")
	return nil, nil, nil
}
