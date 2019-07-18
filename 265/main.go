// Play with gopkg.in/src-d/go-git.v4 API.
package main

import (
	"fmt"
	"log"
	"os"
	"path"
	"strings"

	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/config"
	"gopkg.in/src-d/go-git.v4/plumbing"
	"gopkg.in/src-d/go-git.v4/plumbing/filemode"
	"gopkg.in/src-d/go-git.v4/plumbing/object"
	"gopkg.in/src-d/go-git.v4/storage/memory"
)

func main() {
	err := runD()
	if err != nil {
		log.Fatalln(err)
	}
}

// Clone a repository to memory and list tags.
func runA() error {
	r, err := git.Clone(memory.NewStorage(), nil, &git.CloneOptions{
		URL:      "https://go.googlesource.com/go",
		Progress: os.Stdout,
	})
	if err != nil {
		return err
	}

	tags, err := r.Tags()
	if err != nil {
		return err
	}

	err = tags.ForEach(func(ref *plumbing.Reference) error {
		fmt.Println(ref.Name())
		return nil
	})
	if err != nil {
		return err
	}

	return nil
}

// Fetch a remote to memory and list tags.
func runB() error {
	origin := git.NewRemote(memory.NewStorage(), &config.RemoteConfig{
		URLs: []string{"https://go.googlesource.com/go"},
	})

	refs, err := origin.List(&git.ListOptions{})
	if err != nil {
		return err
	}

	for _, r := range refs {
		name := string(r.Name())
		if !strings.HasPrefix(name, "refs/tags/") {
			continue
		}
		fmt.Println(name[len("refs/tags/"):])
	}

	return nil
}

// Clone a repository to memory and walk a tree.
func runC() error {
	r, err := git.Clone(memory.NewStorage(), nil, &git.CloneOptions{
		URL:           "https://go.googlesource.com/go",
		ReferenceName: plumbing.NewBranchReferenceName("master"),
		SingleBranch:  true,
		Depth:         1,
		Tags:          git.NoTags,
	})
	if err != nil {
		return err
	}

	head, err := r.Head()
	if err != nil {
		return err
	}

	commit, err := r.CommitObject(head.Hash())
	if err != nil {
		return err
	}

	tree, err := r.TreeObject(commit.TreeHash)
	if err != nil {
		return err
	}

	type treePath struct {
		*object.Tree
		Path string
	}
	for frontier := []treePath{{Tree: tree, Path: "/"}}; len(frontier) > 0; frontier = frontier[1:] {
		t := frontier[0]

		for _, e := range t.Entries {
			if e.Mode != filemode.Dir {
				// We only care about directories.
				continue
			}
			if strings.HasPrefix(e.Name, ".") || strings.HasPrefix(e.Name, "_") || e.Name == "testdata" {
				continue
			}

			tree, err := r.TreeObject(e.Hash)
			if err != nil {
				return err
			}
			frontier = append(frontier, treePath{
				Tree: tree,
				Path: path.Join(t.Path, e.Name),
			})
		}

		fmt.Println(t.Path)
	}

	return nil
}

// Clone a repository to memory and ...
func runD() error {
	r, err := git.Clone(memory.NewStorage(), nil, &git.CloneOptions{
		URL:           "https://go.googlesource.com/time",
		ReferenceName: plumbing.NewBranchReferenceName("master"),
		SingleBranch:  true,
		Depth:         1,
		Tags:          git.NoTags,
	})
	if err != nil {
		return err
	}

	head, err := r.Head()
	if err != nil {
		return err
	}

	commit, err := r.CommitObject(head.Hash())
	if err != nil {
		return err
	}

	tree, err := r.TreeObject(commit.TreeHash)
	if err != nil {
		return err
	}

	type treePath struct {
		*object.Tree
		Path string
	}
	for frontier := []treePath{{Tree: tree, Path: "/"}}; len(frontier) > 0; frontier = frontier[1:] {
		t := frontier[0]

		for _, e := range t.Entries {
			if e.Mode != filemode.Dir {
				// We only care about directories.
				continue
			}
			if strings.HasPrefix(e.Name, ".") || strings.HasPrefix(e.Name, "_") || e.Name == "testdata" {
				continue
			}

			tree, err := r.TreeObject(e.Hash)
			if err != nil {
				return err
			}
			frontier = append(frontier, treePath{
				Tree: tree,
				Path: path.Join(t.Path, e.Name),
			})
		}

		for _, e := range t.Entries {
			if e.Mode != filemode.Regular && e.Mode != filemode.Executable {
				continue
			}

			fmt.Println(path.Join(t.Path, e.Name))

			//blob, err := r.BlobObject(e.Hash)
			//if err != nil {
			//	return err
			//}

			//r, err := blob.Reader()
			//if err != nil {
			//	return err
			//}
			//io.Copy(os.Stdout, r)
			//r.Close()
		}
	}

	return nil
}
