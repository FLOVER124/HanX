class Hanx < Formula
  desc "Local office document CLI, desktop setup, and MCP tools"
  homepage "https://hanx.io/"
  version "2.13.3"
  license "MIT"

  on_macos do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.3/HanX-CLI-2.13.3-macOS.zip"
    sha256 "00bec5c9b95651bce1915965f03bcf2aa4fe0b40a0dc1e8122a444823651b6ef"
    depends_on :macos => :ventura
  end
  on_linux do
    on_intel do
      url "https://github.com/FLOVER124/HanX/releases/download/v2.13.3/HanX-CLI-2.13.3-linux-x64.tar.gz"
      sha256 "a2c46bee31945cb96a2e30be5fa1de8a2174d7cc8e707864199b961c09271cf1"
    end
  end
  depends_on "node"

  resource "setup" do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.3/HanX-Setup-2.13.3.tar.gz"
    sha256 "41ba00c83e8bcf72b48f31fa5f00d024d0f141639e68f303a1e4867568abee6e"
  end

  def install
    platform = OS.mac? ? "darwin" : "linux"
    arch = Hardware::CPU.arm? ? "arm64" : "x64"
    native = libexec/"native/#{platform}-#{arch}"
    native.install Dir["*"]
    resource("setup").stage { libexec.install "bin", "lib", "package.json" }
    (bin/"hanx").write <<~SH
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/hanx.js" "$@"
    SH
    bin.install_symlink "hanx" => "hanx-cli"
    pkgshare.install native/"LICENSE", native/"NOTICE"
  end

  def caveats
    <<~EOS
      CLI is ready. Run `hanx setup` to choose CLI only, GUI only, or both.
      Homebrew lifecycle installation never blocks on a prompt and never downloads a GUI.
      GUI-only keeps the small setup launcher and disables terminal document commands.
      The desktop app retains an internal engine. Linux GUI installation is per-user.
      PDF export may require a compatible local renderer; none is installed automatically.
    EOS
  end

  test do
    require "json"
    assert_equal version.to_s, JSON.parse(shell_output("#{bin}/hanx --version"))["data"]["version"]
    (testpath/"spec.json").write(JSON.generate({kind: "spreadsheet", sheets: [{name: "Data", rows: [[2], [4]], cells: {"B1" => "=SUM(A1:A2)"}}]}))
    system bin/"hanx", "create", "--spec", testpath/"spec.json", "--output", testpath/"test.xlsx"
    data = JSON.parse(shell_output("#{bin}/hanx spreadsheet read #{testpath}/test.xlsx --sheet Data --range B1"))
    assert_equal 6, data["data"]["cells"][0]["value"]
  end
end
