import path from 'path'
import fs from 'fs'
import parseInterface from 'aspida/dist/parseInterface'

export default (inputDir: string) => {
  const middlewares: string[] = []
  const controllers: string[] = []
  const validates: string[] = []

  const createText = (input: string, indent: string, params: [string, string][], user = '') => {
    let result = ''
    const userPath = fs.existsSync(path.join(input, '@user.ts'))
      ? './@user'
      : user
      ? `./.${user}`
      : ''

    if (params.length || userPath) {
      fs.writeFileSync(
        path.join(input, '$values.ts'),
        `/* eslint-disable */
${userPath ? `import { User } from '${userPath}'\n\n` : ''}export type Values = {
${
  params.length
    ? `  params: {
${params.map(v => `    ${v[0]}: ${v[1]}`).join('\n')}
  }`
    : ''
}${params.length ? '\n' : ''}${userPath ? '  user: User' : ''}
}
`,
        'utf8'
      )
    } else if (fs.existsSync(path.join(input, '@values.ts'))) {
      fs.unlinkSync(path.join(input, '$values.ts'))
    }

    if (fs.existsSync(path.join(input, 'index.ts'))) {
      const text = fs.readFileSync(path.join(input, 'index.ts'), 'utf8')
      const methods = parseInterface(text, 'Methods')
      if (methods) {
        const validateInfo = methods
          .map(m => {
            const props: [string, string][] = []
            if (m.props.query && text.includes(`export class ${m.props.query.value} `)) {
              props.push(['Query', m.props.query.value])
            }
            if (m.props.reqBody && text.includes(`export class ${m.props.reqBody.value} `)) {
              props.push(['Body', m.props.reqBody.value])
            }
            if (m.props.reqHeaders && text.includes(`export class ${m.props.reqHeaders.value} `)) {
              props.push(['Headers', m.props.reqHeaders.value])
            }
            return { method: m.name, props }
          })
          .filter(v => v.props.length)

        if (validateInfo.length) {
          result += `,\n${indent}validator: {\n${validateInfo
            .map(
              v =>
                `  ${indent}${v.method}: {\n${v.props
                  .map(p => `    ${indent}${p[0]}: Validator${validates.length}.${p[1]}`)
                  .join(',\n')}\n  ${indent}}`
            )
            .join(',\n')}\n${indent}}`
          validates.push(input)
        }
      }
    }

    if (fs.existsSync(path.join(input, '@controller.ts'))) {
      result += `,\n${indent}controller: controller${controllers.length}`
      controllers.push(`${input}/@controller`)
    }

    if (fs.existsSync(path.join(input, '@middleware.ts'))) {
      result += `,\n${indent}middleware: middleware${middlewares.length}`
      middlewares.push(`${input}/@middleware`)
    }

    const childrenDirs = fs
      .readdirSync(input)
      .filter(d => fs.statSync(path.join(input, d)).isDirectory())
    if (childrenDirs.length) {
      result += `,\n${indent}children: {\n`
      const names = childrenDirs.filter(d => !d.startsWith('_'))
      if (names.length) {
        result += `  ${indent}names: [\n`
        result += names
          .map(
            n =>
              `    ${indent}{\n      ${indent}name: '/${n}'${createText(
                path.posix.join(input, n),
                `      ${indent}`,
                params,
                userPath
              )}\n    ${indent}}`
          )
          .join(',\n')
        result += `\n  ${indent}]`
      }

      const value = childrenDirs.find(d => d.startsWith('_'))
      if (value) {
        result += `${
          names.length ? ',\n' : ''
        }  ${indent}value: {\n    ${indent}name: '/${value}'${createText(
          path.posix.join(input, value),
          `    ${indent}`,
          [...params, [value.slice(1).split('@')[0], value.split('@')[1] ?? 'string']],
          userPath
        )}\n  ${indent}}`
      }
      result += `\n${indent}}`
    }

    return result
  }

  const text = createText(inputDir, '  ', [])

  return `/* eslint-disable */${validates.length ? '\n' : ''}${validates
    .map((v, i) => `import * as Validator${i} from '${v.replace(inputDir, '.')}'`)
    .join('\n')}${controllers.length ? '\n' : ''}${controllers
    .map((c, i) => `import controller${i} from '${c.replace(inputDir, '.')}'`)
    .join('\n')}${middlewares.length ? '\n' : ''}${middlewares
    .map((m, i) => `import middleware${i} from '${m.replace(inputDir, '.')}'`)
    .join('\n')}

export default {
  name: '/'${text}
}
`
}
