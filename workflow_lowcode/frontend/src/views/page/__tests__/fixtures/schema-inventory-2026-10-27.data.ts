/**
 * schema 键库存快照（E-0 闭环判据 fixture）：backend-node/tools/schema-audit.ts
 * 2026-10-27 对 workflow_v6 全量扫描输出（E-0 扩面后含 pages.ruleGroups 与 columnConfig）。
 * channelSchemaPolicy.test.ts 据此机械校验「策略表覆盖全部扫出键」。
 * 重新生成：cd backend-node; pnpm exec tsx tools/schema-audit.ts 后转存本文件（保持 UTF-8）。
 */
export const SCHEMA_INVENTORY_2026_10_27 = {
  "generatedAt": "2026-10-27T10:15:38.047Z",
  "database": "workflow_v6",
  "pages": {
    "scanned": 5,
    "parseErrors": [],
    "groups": {
      "searchFields": {
        "key": {
          "instances": 5,
          "assets": 3,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 3,
          "assets": 3,
          "presentationCandidate": false
        },
        "label": {
          "instances": 4,
          "assets": 2,
          "presentationCandidate": false
        },
        "matchType": {
          "instances": 3,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "columns": {
        "key": {
          "instances": 6,
          "assets": 3,
          "presentationCandidate": false
        },
        "label": {
          "instances": 6,
          "assets": 3,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 3,
          "assets": 3,
          "presentationCandidate": false
        },
        "width": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "align": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "custom": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "contentType": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "hidden": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        }
      },
      "actions": {
        "view": {
          "instances": 2,
          "assets": 2,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 5,
          "assets": 5,
          "presentationCandidate": false
        },
        "permissions": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "actionColumnWidth": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "buttons": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "trigger": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "source": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "steps": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "display": {
        "@scalar": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "sortableFields": {
        "@section": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "pagination": {
        "show": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "pageSize": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "pageSizes": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "filter": {
        "logic": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "conditions": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "detail": {
        "width": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "height": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "formMode": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "events": {
        "on": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "steps": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "rule": {
        "type": {
          "instances": 9,
          "assets": 2,
          "presentationCandidate": false
        },
        "field": {
          "instances": 9,
          "assets": 2,
          "presentationCandidate": false
        },
        "title": {
          "instances": 9,
          "assets": 2,
          "presentationCandidate": false
        },
        "value": {
          "instances": 3,
          "assets": 1,
          "presentationCandidate": false
        },
        "props": {
          "instances": 8,
          "assets": 2,
          "presentationCandidate": false
        },
        "matchType": {
          "instances": 3,
          "assets": 1,
          "presentationCandidate": false
        },
        "events": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 3,
          "assets": 3,
          "presentationCandidate": false
        },
        "_fc_id": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": false
        },
        "name": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": false
        },
        "_fc_drag_tag": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": false
        },
        "display": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": false
        },
        "hidden": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": true
        },
        "info": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "$required": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "option": {
        "@section": {
          "instances": 2,
          "assets": 2,
          "presentationCandidate": false
        },
        "form": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "resetBtn": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "submitBtn": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "dataSources": {
        "id": {
          "instances": 2,
          "assets": 2,
          "presentationCandidate": false
        },
        "refId": {
          "instances": 2,
          "assets": 2,
          "presentationCandidate": false
        },
        "name": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "@section": {
          "instances": 2,
          "assets": 2,
          "presentationCandidate": false
        },
        "searchFields": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      }
    },
    "ruleGroups": {
      "page-rule:input": {
        "type": {
          "instances": 3,
          "assets": 2,
          "presentationCandidate": false
        },
        "field": {
          "instances": 3,
          "assets": 2,
          "presentationCandidate": false
        },
        "title": {
          "instances": 3,
          "assets": 2,
          "presentationCandidate": false
        },
        "value": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.placeholder": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.style": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": true
        },
        "matchType": {
          "instances": 2,
          "assets": 1,
          "presentationCandidate": false
        },
        "info": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "$required": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "_fc_id": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "name": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "_fc_drag_tag": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "display": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "hidden": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        }
      },
      "page-rule:datePicker": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "value": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.placeholder": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.style": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.valueFormat": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.startPlaceholder": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.endPlaceholder": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "matchType": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "page-rule:table": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.columns": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "page-rule:__page_actions": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.permissions": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.actionColumnWidth": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.buttons": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "page-rule:__page_detail": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.enabled": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.width": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.height": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.formMode": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "page-rule:__page_events": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "events": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "page-rule:page-table": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.dataSourceId": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.border": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.stripe": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.columns": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.sortable": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.filterable": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.pagination": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.selectionMode": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.actionColumnWidth": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.showSearch": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.stretch": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.searchFields": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.sortableFields": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.pageSize": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.pageSizes": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.viewActions": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.viewDetail": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.viewEvents": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.designMode": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "_fc_id": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "name": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "_fc_drag_tag": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "display": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "hidden": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        }
      },
      "page-rule:formContainer": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "info": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "$required": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.recordLocator": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.displayMode": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.dialogWidth": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.dialogHeight": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.tabTitle": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.inlineHeight": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.showNewButton": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.showCancelButton": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.showConfirmButton": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.showDeleteButton": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.showCopyButton": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        },
        "props.customButtons": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.dataSourceId": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "props.rule": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "_fc_id": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "name": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "_fc_drag_tag": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "display": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "hidden": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": true
        }
      }
    }
  },
  "forms": {
    "scanned": 6,
    "parseErrors": [],
    "groups": {
      "input": {
        "type": {
          "instances": 7,
          "assets": 4,
          "presentationCandidate": false
        },
        "field": {
          "instances": 7,
          "assets": 4,
          "presentationCandidate": false
        },
        "title": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      },
      "textarea": {
        "type": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        },
        "field": {
          "instances": 1,
          "assets": 1,
          "presentationCandidate": false
        }
      }
    }
  },
  "columnConfig": {
    "scanned": 7,
    "parseErrors": [],
    "groups": {
      "column": {
        "key": {
          "instances": 38,
          "assets": 7,
          "presentationCandidate": false
        },
        "label": {
          "instances": 18,
          "assets": 4,
          "presentationCandidate": false
        },
        "length": {
          "instances": 28,
          "assets": 7,
          "presentationCandidate": false
        },
        "columnType": {
          "instances": 36,
          "assets": 7,
          "presentationCandidate": false
        },
        "scale": {
          "instances": 19,
          "assets": 5,
          "presentationCandidate": false
        },
        "unique": {
          "instances": 18,
          "assets": 4,
          "presentationCandidate": false
        },
        "indexed": {
          "instances": 19,
          "assets": 4,
          "presentationCandidate": false
        },
        "required": {
          "instances": 19,
          "assets": 5,
          "presentationCandidate": false
        },
        "componentType": {
          "instances": 19,
          "assets": 5,
          "presentationCandidate": false
        },
        "hidden": {
          "instances": 6,
          "assets": 3,
          "presentationCandidate": true
        },
        "pickerConfig": {
          "instances": 4,
          "assets": 2,
          "presentationCandidate": false
        },
        "subColumns": {
          "instances": 2,
          "assets": 2,
          "presentationCandidate": false
        }
      }
    }
  }
}
