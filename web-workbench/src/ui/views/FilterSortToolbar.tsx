import React from 'react';
import { Input } from '../primitives/Input';
import { Select } from '../primitives/Select';
import { Icon } from '../icons/Icon';

export interface FilterState {
  search: string;
  tag: string;
  priority: string;
  status: string; // 'all' | 'active' | 'completed' | 'overdue'
  sort: string; // 'updatedAt' | 'dueDate' | 'priority' | 'createdAt'
  desc: boolean;
}

export interface FilterSortToolbarProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  availableTags?: string[];
}

export const FilterSortToolbar: React.FC<FilterSortToolbarProps> = ({
  filter,
  onChange,
  availableTags = [],
}) => {
  return (
    <div className="filter-row">
      <div className="search-field">
        <Icon name="fa-magnifying-glass" />
        <Input
          aria-label="搜索待办"
          placeholder="搜索待办、标签或备注..."
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
        />
      </div>

      <div className="filter-selects">
        {availableTags.length > 0 && (
          <Select
            aria-label="按标签筛选"
            value={filter.tag}
            onChange={(e) => onChange({ ...filter, tag: e.target.value })}
            options={[
              { value: '', label: '全部标签' },
              ...availableTags.map((t) => ({ value: t, label: `#${t}` })),
            ]}
          />
        )}

        <Select
          aria-label="按优先级筛选"
          value={filter.priority}
          onChange={(e) => onChange({ ...filter, priority: e.target.value })}
          options={[
            { value: '', label: '全部优先级' },
            { value: 'P0', label: 'P0 紧急' },
            { value: 'P1', label: 'P1 高优' },
            { value: 'P2', label: 'P2 普通' },
          ]}
        />

        <Select
          aria-label="按状态筛选"
          value={filter.status}
          onChange={(e) => onChange({ ...filter, status: e.target.value })}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'active', label: '进行中' },
            { value: 'completed', label: '已完成' },
            { value: 'overdue', label: '已逾期' },
          ]}
        />

        <Select
          aria-label="排序方式"
          value={filter.sort}
          onChange={(e) => onChange({ ...filter, sort: e.target.value })}
          options={[
            { value: 'dueDate', label: '按截止时间' },
            { value: 'priority', label: '按优先级' },
            { value: 'updatedAt', label: '按更新时间' },
            { value: 'createdAt', label: '按创建时间' },
          ]}
        />
      </div>
    </div>
  );
};
