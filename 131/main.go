package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/cloudflare/dns"
)

func main() {
	zone := "filippo.io.\t3600\tIN\tDNSKEY\t257 3 13 DGpDkudNu/XQT1KmQkXFtKCfZPxHGV07qSTIcDXS33/WtT8UUG7LyxAgKznsRSFEhiQVR53E69/E57IFm8b6Zw=="

	r := strings.NewReader(zone)
	for {
		rr, err := dns.ReadRR(r, "")
		if err != nil {
			log.Println(err)
			continue
		}
		if rr == nil {
			break
		}

		dnskey, ok := rr.(*dns.DNSKEY)
		if !ok {
			log.Println("Not a DNSKEY:", rr)
			continue
		}

		if dnskey.Flags&dns.SEP == 0 {
			// ZSK
			continue
		}

		ds1 := dnskey.ToDS(dns.SHA1)
		ds2 := dnskey.ToDS(dns.SHA256)

		println(fmt.Sprintf("%s\n%s\n", ds1, ds2))
	}
}
