// +build ignore

package main

import (
	"fmt"
	"time"

	"github.com/samuel/go-zookeeper/zk"

	"github.com/shurcooL/go-goon"
	. "github.com/shurcooL/go/gists/gist5286084"
)

var _ = fmt.Errorf
var _ = goon.Dump

func CreateNodeIfDoesntExist(c *zk.Conn, path string, acl []zk.ACL) {
	exists, _, err := c.Exists(path)
	CheckError(err)
	if !exists {
		path, err := c.Create(path, nil, 0, acl)
		CheckError(err)
		fmt.Printf("Node %s created.\n", path)
	}
}

func main() {
	c, _, err := zk.Connect([]string{"10.0.0.152"}, time.Second)
	CheckError(err)

	worldAcl := zk.WorldACL(zk.PermAll)
	//goon.Dump(worldAcl)

	dmitriTestEntry := "/folder"

	if false {
		acl, _, err := c.GetACL(dmitriTestEntry)
		CheckError(err)
		goon.Dump(acl)
	}

	if true {
		path := "/new_folder"

		CreateNodeIfDoesntExist(c, path, worldAcl)
	}

	if true {
		_, err := c.Set(dmitriTestEntry, []byte("shurcooL` ^.^"), -1)
		CheckError(err)
	}

	if true {
		b, _, err := c.Get(dmitriTestEntry)
		CheckError(err)
		goon.Dump(string(b))
	}

	if false {
		err := c.Delete("/zk_test", -1)
		CheckError(err)
	}

	if true {
		children, _, err := c.Children("/folder")
		CheckError(err)
		goon.Dump(children)
	}
}
