package main

import (
	"fmt"
	"log"
	"os"
	pathpkg "path"
	"sort"
)

// Tree prints a tree of fs at path to stdout.
func Tree(fs ImplicitDirFS, path string) error {
	dirs, files, err := visit(fs, path, "")
	if err != nil {
		return err
	}
	fmt.Printf("\n%v directories, %v files\n", dirs, files)
	return nil
}

func visit(fs ImplicitDirFS, path, indent string) (dirs, files int, err error) {
	fi, err := fs.Stat(path)
	if err != nil {
		return 0, 0, fmt.Errorf("stat %s: %v", path, err)
	}
	fmt.Println(fi.Name())
	if !fi.IsDir() {
		return 0, 1, nil
	}

	dir, err := fs.OpenFile(path, os.O_RDONLY, 0)
	if err != nil {
		return 1, 0, fmt.Errorf("open %s: %v", path, err)
	}
	fis, err := dir.Readdir(0)
	dir.Close()
	if err != nil {
		return 1, 0, fmt.Errorf("read dir %s: %v", path, err)
	}
	sort.Sort(byName(fis))
	add := "│   "
	for i, fi := range fis {
		if i == len(fis)-1 {
			fmt.Print(indent + "└── ")
			add = "    "
		} else {
			fmt.Print(indent + "├── ")
		}
		d, f, err := visit(fs, pathpkg.Join(path, fi.Name()), indent+add)
		if err != nil {
			log.Println(err)
		}
		dirs, files = dirs+d, files+f
	}
	return dirs + 1, files, nil
}

type byName []os.FileInfo

func (s byName) Len() int           { return len(s) }
func (s byName) Less(i, j int) bool { return s[i].Name() < s[j].Name() }
func (s byName) Swap(i, j int)      { s[i], s[j] = s[j], s[i] }
