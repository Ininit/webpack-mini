const fs = require('fs');
const path = require('path');
const options = require("./mini-webpack.config");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");
class MiniWebpack {
  constructor(options) {
    this.options = options;
  }

  parse(filename) {
    // 读取文件
    const fileBuffer = fs.readFileSync(filename, "utf8");

    // babel parse 解析成 ast
    const ast = parser.parse(fileBuffer, { sourceType: "module" });

    // 
    const dependencies = {}

    // 遍历抽象语法树
    traverse(ast, {
      // 处理 ImportDeclaration 节点
      ImportDeclaration({ node }) {
        const dirname = path.dirname(filename);
        const newDirname = './' + path.join(dirname, node.source.value);
        dependencies[node.source.value] = newDirname;
      },
    })

    // 将抽象语法树转换成代码
    const { code } = babel.transformFromAst(ast, null,  {
      presets: ['@babel/preset-env']
    })

    return {
      filename,
      dependencies,
      code,
    }
  }

  /**
   * 分析依赖关系
   * @param {*} entry 
   */
  analyse(entry) {
    // 解析入口文件
    const entryModule = this.parse(entry);
    
    const graphArray = [entryModule];
    
    // 解析 module， 保存信息
    for (let i = 0; i < graphArray.length; i++) {
      const { dependencies } = graphArray[i];
      Object.keys(dependencies).forEach(filename => {
        graphArray.push(this.parse(dependencies[filename]))
      })
    }

    // 生成依赖图谱对象 graph
    const graph = {}

    graphArray.forEach(({ filename, dependencies, code }) => {
      graph[filename] = {
        dependencies,
        code,
      }
    })

    return graph
  }

  generate(graph, entry) {
    return `
      (function(graph) {
        function require(filename) {
          function localRequire(relativePath) {
            return require(graph[filename].dependencies[relativePath]);
          }
          const exports = {};
          (function(require, exports, code) {
            eval(code);
          })(localRequire, exports, graph[filename].code)
          return exports;
        }
        require('${entry}')
      })(${graph})
    `
  }

  fileOutput(output, code) {
    const { path: dirPath, filename } = output
    const outputPath = path.join(dirPath, filename);

    if(!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath)
    }

    fs.writeFileSync(outputPath, code, 'utf-8')
  }

  /**
   * webpack compiler run
   */
  run() {
    const { entry, output } = this.options;
    const graph = this.analyse(entry);

    // 序列化后塞入模板字符串
    const graphStr = JSON.stringify(graph);
    const code = this.generate(graphStr, entry);
    this.fileOutput(output, code);
  }
}

const miniWebpack = new MiniWebpack(options);
miniWebpack.run()
